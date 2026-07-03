import {
	createWhatsAppMessage,
	getConversation,
	getDefaultSession,
	getGhlConnection,
	getMessageByGhlMessageId,
	getMessageByWaMessageId,
	getWhatsAppSession,
	markMessageGhlSynced,
	setConversationGhlLink,
} from "@repo/database";
import {
	createGoHighLevelClient,
	ghlContactDisplayName,
	type GoHighLevelClient,
} from "@repo/integrations";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";

import { syncPrimaryNumberTag } from "../ghl/sync-primary-number-tag";
import type { CanonicalMessage, FanOutDeps } from "./fan-out";

/** Hard cap on the in-request pre-send delay so a delivery-URL post can't hang. */
const MAX_SEND_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The contact's phone in E.164-ish form for CRM matching. Trust order:
 * 1. `senderPhone` (OpenWA's `@lid` → phone resolution) — the only valid source
 *    for privacy-id chats;
 * 2. the chatId digits, but ONLY for phone-keyed JIDs (`@c.us` /
 *    `@s.whatsapp.net`) — `@lid` digits are an opaque privacy id, and using
 *    them would mint a garbage contact in the CRM.
 */
function contactPhone(message: CanonicalMessage): string | null {
	const fromSender = message.senderPhone?.replace(/\D/g, "");
	if (fromSender && fromSender.length >= 6) {
		return `+${fromSender}`;
	}
	if (/@(c\.us|s\.whatsapp\.net)$/.test(message.chatId)) {
		const digits = message.chatId.replace(/@.*/, "").replace(/\D/g, "");
		return digits.length >= 6 ? `+${digits}` : null;
	}
	return null;
}

/** GHL message body for media messages that carry no caption. */
function ghlMessageBody(message: CanonicalMessage): string {
	return message.body?.trim() ? message.body : `[${message.type}]`;
}

/**
 * Resolve the GHL contact + conversation for a thread, caching both ids on the
 * local conversation row: after the first message per thread, projections cost
 * zero extra GHL API calls (and rate-limit pressure) beyond the message post.
 */
async function resolveGhlThread(
	message: CanonicalMessage,
	client: GoHighLevelClient,
	locationId: string,
): Promise<{ conversationId: string } | null> {
	const cached = await getConversation(message.subaccountId, message.chatId);
	if (cached?.ghlConversationId) {
		return { conversationId: cached.ghlConversationId };
	}

	const phone = contactPhone(message);
	if (!phone) {
		// A `@lid` chat with no resolved sender phone: skip the CRM projection
		// rather than mint a contact from privacy-id digits. The row stays
		// ghlSynced=false; a later message with a resolved phone links the thread.
		logger.warn("No contact phone for CRM projection", {
			ctx: "messaging.fanOut.contactPhone",
			chatId: message.chatId,
		});
		return null;
	}

	let contactId = cached?.ghlContactId ?? null;
	let ghlName: string | null = null;
	if (!contactId) {
		const contact = await client.upsertContact({
			phone,
			locationId,
			...(cached?.contactName ? { name: cached.contactName } : {}),
			source: "WABridge",
		});
		contactId = contact.id;
		// When GHL already knew this phone, the upsert returns the existing
		// contact — adopt its name locally (GHL wins when linked).
		ghlName = ghlContactDisplayName(contact);
	}

	// Mark this contact's primary WhatsApp number on its GHL contact via the
	// `wa:<digits>` tag. Best-effort (never fails the projection); runs for both
	// the inbound and outbound-record paths since both resolve the thread here.
	await syncPrimaryNumberTag(client, contactId, phone);

	const conversation = await client.getOrCreateConversation({ locationId, contactId });

	await setConversationGhlLink({
		subaccountId: message.subaccountId,
		organizationId: message.organizationId,
		chatId: message.chatId,
		ghlContactId: contactId,
		ghlConversationId: conversation.id,
		contactName: ghlName,
	});

	return { conversationId: conversation.id };
}

/** Resolve the WhatsApp session that owns/sends this thread. */
async function resolveSession(message: CanonicalMessage) {
	if (message.sessionId) {
		const byId = await getWhatsAppSession(message.subaccountId, message.sessionId);
		if (byId) {
			return byId;
		}
	}
	return getDefaultSession(message.subaccountId);
}

/**
 * Production wiring for {@link fanOutMessage}. GHL projections are guarded: they
 * no-op (return null) when the subaccount has no GoHighLevel connection yet, so
 * the hub works today and lights up GHL automatically once connected.
 */
export function createFanOutDeps(): FanOutDeps {
	return {
		findByWaMessageId: (subaccountId, waMessageId) =>
			getMessageByWaMessageId(subaccountId, waMessageId).then((m) => (m ? { id: m.id } : null)),

		findByGhlMessageId: (subaccountId, ghlMessageId) =>
			getMessageByGhlMessageId(subaccountId, ghlMessageId).then((m) => (m ? { id: m.id } : null)),

		async persist(message) {
			const session = await resolveSession(message);
			const row = await createWhatsAppMessage({
				subaccountId: message.subaccountId,
				organizationId: message.organizationId,
				sessionId: session?.id ?? message.sessionId,
				direction: message.direction,
				chatId: message.chatId,
				fromMe: message.direction === "outbound",
				type: message.type,
				body: message.body,
				status: message.direction === "outbound" ? "sent" : null,
				waMessageId: message.waMessageId ?? null,
				origin: message.origin,
				authorName: message.authorName ?? null,
				authorPhone: message.authorPhone ?? null,
				ghlMessageId: message.ghlMessageId ?? null,
				timestamp: message.timestamp,
			});
			return { id: row.id };
		},

		async sendOverWhatsApp(message) {
			const session = await resolveSession(message);
			if (!session) {
				logger.error("fanOut: no WhatsApp session to send from", {
					ctx: "messaging.fanOut",
					subaccountId: message.subaccountId,
				});
				return { waMessageId: null };
			}
			// Human-like delay from a `!/DELAY/x/y/!` directive. Capped so a synchronous
			// delivery-URL request can't hang (mirrors MAX_DELAY_MS in @repo/whatsapp send).
			if (message.sendDelayMs && message.sendDelayMs > 0) {
				await sleep(Math.min(message.sendDelayMs, MAX_SEND_DELAY_MS));
			}
			const openwa = createOpenWaClient();
			const result = await openwa.sendText(session.openwaSessionId, {
				chatId: message.chatId,
				text: message.body ?? "",
			});
			return { waMessageId: result?.messageId ?? result?.id ?? null };
		},

		// Both GHL projections are best-effort: a GHL outage or bad token must never
		// fail the inbound webhook or block a WhatsApp send. Failures log and leave
		// the row ghlSynced=false for a later sweep.
		async pushGhlInbound(message) {
			try {
				const [client, connection] = await Promise.all([
					createGoHighLevelClient(message.subaccountId),
					getGhlConnection(message.subaccountId),
				]);
				if (!client || !connection) {
					return null;
				}
				const thread = await resolveGhlThread(message, client, connection.locationId);
				if (!thread) {
					return null;
				}
				const res = await client.postInboundMessage({
					// SMS-replace (Option B): no conversationProviderId.
					conversationId: thread.conversationId,
					message: ghlMessageBody(message),
					attachments: message.attachments,
					type: "SMS",
					date: message.timestamp.toISOString(),
				});
				return { ghlMessageId: res.messageId ?? res.message?.id ?? null };
			} catch (error) {
				logger.error(error, { ctx: "messaging.fanOut.pushGhlInbound", chatId: message.chatId });
				return null;
			}
		},

		async recordGhlOutbound(message) {
			try {
				const [client, connection] = await Promise.all([
					createGoHighLevelClient(message.subaccountId),
					getGhlConnection(message.subaccountId),
				]);
				if (!client || !connection) {
					return null;
				}
				const thread = await resolveGhlThread(message, client, connection.locationId);
				if (!thread) {
					return null;
				}
				const res = await client.postOutboundMessageRecord({
					conversationId: thread.conversationId,
					message: ghlMessageBody(message),
					attachments: message.attachments,
					type: "SMS",
					date: message.timestamp.toISOString(),
					// Unlike the inbound API, GHL's outbound-record endpoint REQUIRES the
					// provider id even for the SMS-replace provider
					// (CONVERSATIONS_MSG_PROVIDER_ID_REQUIRED).
					conversationProviderId:
						connection.smsProviderId ?? connection.conversationProviderId ?? undefined,
				});
				return { ghlMessageId: res.messageId ?? res.message?.id ?? null };
			} catch (error) {
				logger.error(error, { ctx: "messaging.fanOut.recordGhlOutbound", chatId: message.chatId });
				return null;
			}
		},

		// Cache the thread's GHL contact/conversation ids without posting the
		// message back (GHL-originated sends). Same resolve/upsert-by-phone path as
		// the projections, so the contact panel can read through to the CRM for a
		// GHL-initiated thread before the contact ever replies. Best-effort.
		async linkGhlThread(message) {
			try {
				const [client, connection] = await Promise.all([
					createGoHighLevelClient(message.subaccountId),
					getGhlConnection(message.subaccountId),
				]);
				if (!client || !connection) {
					return;
				}
				await resolveGhlThread(message, client, connection.locationId);
			} catch (error) {
				logger.error(error, { ctx: "messaging.fanOut.linkGhlThread", chatId: message.chatId });
			}
		},

		async markSynced(id, ghlMessageId) {
			await markMessageGhlSynced(id, ghlMessageId);
		},

		notifyApp() {
			// The embedded messenger already polls; a realtime channel can hook here.
		},
	};
}
