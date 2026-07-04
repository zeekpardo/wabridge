import { type CrmProvider, resolveCrmProvider } from "@repo/crm";
import {
	createWhatsAppMessage,
	getConversation,
	getDefaultSession,
	getMessageByGhlMessageId,
	getMessageByWaMessageId,
	getWhatsAppSession,
	markMessageGhlSynced,
	setConversationGhlLink,
} from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";

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

/**
 * A unique fake E.164 phone (`+1` + 10 random digits) to key a group's synthetic
 * CRM contact by. Groups have no real number; this placeholder is the reverse-
 * routing key the CRM holds the group contact by. `Math.random` is fine here —
 * collisions are cosmetic (the row is re-linked on the next message).
 */
function generatePlaceholderPhone(): string {
	let digits = "";
	for (let i = 0; i < 10; i++) {
		digits += Math.floor(Math.random() * 10).toString();
	}
	return `+1${digits}`;
}

/**
 * The group's subject (its display name), so the synthetic CRM contact is named
 * after the group instead of the provider's generic fallback. Best-effort: the
 * gateway holds the subject, and our number is a member (it received/sent this
 * message), so `getGroupInfo` resolves. Any failure returns null and the caller
 * falls back to the cached name / provider default.
 */
async function resolveGroupName(
	subaccountId: string,
	sessionId: string,
	groupJid: string,
): Promise<string | null> {
	try {
		const session = await getWhatsAppSession(subaccountId, sessionId);
		if (!session) {
			return null;
		}
		const info = await createOpenWaClient().getGroupInfo(session.openwaSessionId, groupJid);
		return info.name?.trim() ? info.name.trim() : null;
	} catch (error) {
		logger.warn(error, { ctx: "messaging.resolveGroupName", groupJid });
		return null;
	}
}

/**
 * GHL message body for media messages that carry no caption. Inbound GROUP
 * messages are prefixed with the sending member's name (`<authorName>: <body>`)
 * so the CRM timeline shows who spoke; 1:1 and outbound bodies are unchanged.
 */
function ghlMessageBody(message: CanonicalMessage): string {
	const body = message.body?.trim() ? message.body : `[${message.type}]`;
	if (message.chatId.endsWith("@g.us") && message.direction === "inbound" && message.authorName) {
		return `${message.authorName}: ${body}`;
	}
	return body;
}

/**
 * Resolve the GHL contact + conversation for a thread, caching both ids on the
 * local conversation row: after the first message per thread, projections cost
 * zero extra GHL API calls (and rate-limit pressure) beyond the message post.
 */
async function resolveGhlThread(
	message: CanonicalMessage,
	provider: CrmProvider,
): Promise<{ conversationId: string } | null> {
	const cached = await getConversation(message.subaccountId, message.chatId);
	if (cached?.ghlConversationId) {
		return { conversationId: cached.ghlConversationId };
	}

	// GROUP chats (`@g.us`) have no real contact phone, so they never fall into
	// the phone/@lid path below. Mirror the group as a synthetic CRM contact keyed
	// by a stable placeholder phone we assign (the reverse-routing key), with the
	// group jid as the recognizable email/name. Best-effort, like the rest.
	if (message.chatId.endsWith("@g.us")) {
		const placeholderPhone = cached?.crmPlaceholderPhone ?? generatePlaceholderPhone();

		let contactId = cached?.ghlContactId ?? null;
		let ghlName = cached?.contactName ?? null;
		if (!contactId) {
			// Name the CRM contact after the group subject (falls back to the cached
			// name, then the provider's generic default if neither is available).
			const groupName =
				(await resolveGroupName(message.subaccountId, message.sessionId, message.chatId)) ??
				cached?.contactName ??
				null;
			const contact = await provider.upsertGroupContact({
				groupJid: message.chatId,
				placeholderPhone,
				name: groupName,
			});
			contactId = contact.id;
			// Adopt the CRM's name (it wins once linked, as with 1:1 contacts).
			ghlName = contact.name;
		}

		// No `setPrimaryNumberTag` for groups: the placeholder isn't a real number.
		const conversation = await provider.getOrCreateConversation(contactId);

		await setConversationGhlLink({
			subaccountId: message.subaccountId,
			organizationId: message.organizationId,
			chatId: message.chatId,
			ghlContactId: contactId,
			ghlConversationId: conversation.id,
			crmPlaceholderPhone: placeholderPhone,
			contactName: ghlName,
		});

		return { conversationId: conversation.id };
	}

	// Resolve the business WhatsApp session that owns/sends this thread up front. Its phone is the
	// number the contact communicates with (the one they messaged us on / we contact them from) — the
	// number we send FROM — which is what the `wa:<number>` primary-number tag must carry.
	const session = await resolveSession(message);

	let phone = contactPhone(message);
	if (!phone && message.chatId.endsWith("@lid")) {
		// Outbound to a `@lid` (privacy) contact carries no `senderPhone`, and the
		// lid digits are not a phone — so the FIRST message to a new contact could
		// never mirror (only later ones, after an inbound resolved + cached the
		// link). Resolve the lid -> phone via the gateway (same self-heal the
		// contact panel uses) so the initial message logs immediately. Best-effort.
		if (session) {
			const digits = await createOpenWaClient()
				.resolveContactPhone(session.openwaSessionId, message.chatId)
				.catch(() => null);
			if (digits) {
				phone = `+${digits}`;
			}
		}
	}
	if (!phone) {
		// Still no phone (e.g. the gateway can't map this lid): skip the CRM
		// projection rather than mint a contact from privacy-id digits. The row
		// stays ghlSynced=false; a later message with a resolved phone links it.
		logger.warn("No contact phone for CRM projection", {
			ctx: "messaging.fanOut.contactPhone",
			chatId: message.chatId,
		});
		return null;
	}

	let contactId = cached?.ghlContactId ?? null;
	let ghlName: string | null = null;
	if (!contactId) {
		const contact = await provider.upsertContactByPhone({
			phone,
			...(cached?.contactName ? { name: cached.contactName } : {}),
		});
		contactId = contact.id;
		// When GHL already knew this phone, the upsert returns the existing
		// contact — adopt its name locally (GHL wins when linked).
		ghlName = contact.name;
	}

	// Mark the contact's primary WhatsApp number on its GHL contact via the `wa:<digits>` tag. This is
	// the BUSINESS number this thread uses (the session's phone) — the number we send FROM to reach
	// this contact — NOT the contact's own number (`phone`). Best-effort (never fails the projection);
	// runs for both the inbound and outbound-record paths since both resolve the thread here.
	if (session?.phone) {
		await provider.setPrimaryNumberTag(contactId, session.phone);
	}

	const conversation = await provider.getOrCreateConversation(contactId);

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
			// Rich commands (contact card / location pin) send a typed message instead of text.
			let result: { messageId?: string; id?: string };
			if (message.type === "contact" && message.contact) {
				result = await openwa.sendContact(session.openwaSessionId, {
					chatId: message.chatId,
					contactName: message.contact.name,
					contactNumber: message.contact.number,
				});
			} else if (message.type === "location" && message.location) {
				result = await openwa.sendLocation(session.openwaSessionId, {
					chatId: message.chatId,
					latitude: message.location.latitude,
					longitude: message.location.longitude,
					description: message.location.note,
					address: message.location.address,
				});
			} else {
				result = await openwa.sendText(session.openwaSessionId, {
					chatId: message.chatId,
					text: message.body ?? "",
				});
			}
			return { waMessageId: result?.messageId ?? result?.id ?? null };
		},

		// Both GHL projections are best-effort: a GHL outage or bad token must never
		// fail the inbound webhook or block a WhatsApp send. Failures log and leave
		// the row ghlSynced=false for a later sweep.
		async pushGhlInbound(message) {
			try {
				const provider = await resolveCrmProvider(message.subaccountId);
				if (!provider) {
					return null;
				}
				const thread = await resolveGhlThread(message, provider);
				if (!thread) {
					return null;
				}
				const res = await provider.recordInbound({
					conversationId: thread.conversationId,
					body: ghlMessageBody(message),
					attachments: message.attachments,
					type: "SMS",
					date: message.timestamp.toISOString(),
				});
				return { ghlMessageId: res.crmMessageId };
			} catch (error) {
				logger.error(error, { ctx: "messaging.fanOut.pushGhlInbound", chatId: message.chatId });
				return null;
			}
		},

		async recordGhlOutbound(message) {
			try {
				const provider = await resolveCrmProvider(message.subaccountId);
				if (!provider) {
					return null;
				}
				const thread = await resolveGhlThread(message, provider);
				if (!thread) {
					return null;
				}
				const res = await provider.recordOutbound({
					conversationId: thread.conversationId,
					body: ghlMessageBody(message),
					attachments: message.attachments,
					type: "SMS",
					date: message.timestamp.toISOString(),
				});
				return { ghlMessageId: res.crmMessageId };
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
				const provider = await resolveCrmProvider(message.subaccountId);
				if (!provider) {
					return;
				}
				await resolveGhlThread(message, provider);
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
