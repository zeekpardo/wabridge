import { listConversations, listSendableSessions } from "@repo/database";
import { type OpenWaChat, createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

interface ChatListItem {
	chatId: string;
	contactName: string | null;
	phone: string | null;
	lastMessagePreview: string | null;
	lastMessageAt: Date | null;
	unreadCount: number;
	isGroup: boolean;
	activeSession: {
		id: string;
		label: string | null;
		phone: string | null;
		priority: number;
		status: string;
	} | null;
}

function isSystemChat(chatId: string): boolean {
	return chatId === "0@c.us" || chatId.endsWith("@broadcast") || chatId.startsWith("status@");
}

function phoneFromChatId(chatId: string): string | null {
	const match = chatId.match(/^(\d+)@c\.us$/);
	return match ? `+${match[1]}` : null;
}

/**
 * A stable per-contact key so the same person doesn't appear twice when WhatsApp
 * exposes them as both a `@lid` (privacy id) chat and a `@c.us` conversation.
 * Keys 1:1 chats by phone digits (from the chatId or a phone-shaped name),
 * everything else (groups, unknown lids) by the raw chatId.
 */
function contactKey(item: ChatListItem): string {
	const cus = item.chatId.match(/^(\d+)@c\.us$/);
	if (cus) {
		return `p:${cus[1]}`;
	}
	if (item.chatId.endsWith("@lid")) {
		const nameDigits = (item.contactName ?? "").replace(/\D/g, "");
		if (nameDigits.length >= 8) {
			return `p:${nameDigits}`;
		}
	}
	return `c:${item.chatId}`;
}

function looksLikePhone(name: string | null): boolean {
	return !name || /^\+?[\d ()-]+$/.test(name);
}

/** Collapse duplicate contact rows (lid vs c.us), preferring the tracked thread. */
function dedupeByContact(items: ChatListItem[]): ChatListItem[] {
	const byKey = new Map<string, ChatListItem>();
	for (const item of items) {
		const key = contactKey(item);
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, item);
			continue;
		}
		// Canonical row = the one we already track (has a conversation/active number).
		const canonical = item.activeSession && !existing.activeSession ? item : existing;
		const other = canonical === existing ? item : existing;
		canonical.unreadCount = Math.max(existing.unreadCount, item.unreadCount);
		canonical.activeSession = canonical.activeSession ?? other.activeSession;
		const canonicalAt = canonical.lastMessageAt?.getTime() ?? 0;
		const otherAt = other.lastMessageAt?.getTime() ?? 0;
		if (otherAt > canonicalAt) {
			canonical.lastMessageAt = other.lastMessageAt;
			canonical.lastMessagePreview = other.lastMessagePreview ?? canonical.lastMessagePreview;
		}
		// Prefer a real name over a bare phone number.
		if (looksLikePhone(canonical.contactName) && !looksLikePhone(other.contactName)) {
			canonical.contactName = other.contactName;
		}
		byKey.set(key, canonical);
	}
	return [...byKey.values()];
}

/** OpenWA returns base64 media blobs as `lastMessage`; keep previews readable. */
function cleanPreview(value?: string): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	const looksBase64 =
		trimmed.length > 60 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed.replace(/\s/g, ""));
	if (looksBase64 || trimmed.startsWith("/9j/") || trimmed.startsWith("iVBOR")) {
		return "[media]";
	}
	return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

export const listChats = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/chats",
		tags: ["WhatsApp"],
		summary: "List all WhatsApp chats",
		description:
			"All chats pulled from the subaccount's connected number(s) via OpenWA, merged and overlaid with tracked conversation state (unread, active number).",
	})
	.input(
		z.object({
			subaccountId: z.string().optional(),
			/** Restrict to threads whose cached owner id matches. */
			ownerId: z.string().optional(),
			/** Restrict by a tag the thread has ("has") or lacks ("not"). */
			tag: z.string().optional(),
			tagMode: z.enum(["has", "not"]).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const sessions = await listSendableSessions(subaccount.id);
		if (sessions.length === 0) {
			return [] as ChatListItem[];
		}

		const openwa = createOpenWaClient();
		const chatArrays = await Promise.all(
			sessions.map((row) => openwa.getChats(row.openwaSessionId).catch(() => [] as OpenWaChat[])),
		);

		// Merge chats across numbers, keeping the most recent per chatId.
		const merged = new Map<string, OpenWaChat>();
		for (const chats of chatArrays) {
			for (const chat of chats) {
				if (isSystemChat(chat.id)) {
					continue;
				}
				const existing = merged.get(chat.id);
				if (!existing || chat.timestamp > existing.timestamp) {
					merged.set(chat.id, chat);
				}
			}
		}

		const conversations = await listConversations(subaccount.id);
		const convoByChat = new Map(conversations.map((c) => [c.chatId, c]));

		const items: ChatListItem[] = [];
		for (const chat of merged.values()) {
			const convo = convoByChat.get(chat.id);
			// Name precedence: a CRM-linked thread carries the CRM's name on the
			// conversation row (GHL wins when linked); otherwise WhatsApp's live
			// name (pushName) beats any stale local copy.
			const crmName = convo?.ghlContactId ? convo.contactName?.trim() : null;
			items.push({
				chatId: chat.id,
				contactName: crmName || chat.name || convo?.contactName || null,
				phone: phoneFromChatId(chat.id),
				lastMessagePreview: convo?.lastMessagePreview ?? cleanPreview(chat.lastMessage),
				lastMessageAt: convo?.lastMessageAt ?? new Date(chat.timestamp * 1000),
				unreadCount: convo?.unreadCount ?? chat.unreadCount ?? 0,
				isGroup: chat.isGroup,
				activeSession: convo?.activeSession ?? null,
			});
		}

		// Include tracked conversations OpenWA didn't return (e.g. brand-new threads).
		for (const convo of conversations) {
			if (!merged.has(convo.chatId)) {
				items.push({
					chatId: convo.chatId,
					contactName: convo.contactName,
					phone: phoneFromChatId(convo.chatId),
					lastMessagePreview: convo.lastMessagePreview,
					lastMessageAt: convo.lastMessageAt,
					unreadCount: convo.unreadCount,
					isGroup: convo.chatId.endsWith("@g.us"),
					activeSession: convo.activeSession,
				});
			}
		}

		let deduped = dedupeByContact(items);

		// Owner / tag filters operate on the cached conversation row (owner id and
		// tags synced from GHL). Threads with no conversation row — or not yet
		// synced — carry no owner/tags, so they fall out of an active filter.
		const tagFilter = input.tag?.trim().toLowerCase();
		if (input.ownerId || tagFilter) {
			deduped = deduped.filter((item) => {
				const convo = convoByChat.get(item.chatId);
				if (input.ownerId && convo?.ownerId !== input.ownerId) {
					return false;
				}
				if (tagFilter) {
					const tags = Array.isArray(convo?.tags)
						? (convo.tags as unknown[]).filter((t): t is string => typeof t === "string")
						: [];
					const has = tags.some((t) => t.toLowerCase() === tagFilter);
					if (input.tagMode === "not" ? has : !has) {
						return false;
					}
				}
				return true;
			});
		}

		deduped.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));

		return deduped;
	});
