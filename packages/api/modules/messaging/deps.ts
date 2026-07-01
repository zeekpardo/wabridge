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
import { createGoHighLevelClient, type GoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";

import type { CanonicalMessage, FanOutDeps } from "./fan-out";

/** `15551234567@c.us` → `+15551234567` for GHL contact matching. */
function phoneFromChatId(chatId: string): string | null {
	const digits = chatId.replace(/@.*/, "").replace(/\D/g, "");
	return digits.length >= 6 ? `+${digits}` : null;
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

	const phone = phoneFromChatId(message.chatId);
	if (!phone) {
		return null;
	}

	const contactId =
		cached?.ghlContactId ??
		(
			await client.upsertContact({
				phone,
				locationId,
				...(cached?.contactName ? { name: cached.contactName } : {}),
				source: "WABridge",
			})
		).id;

	const conversation = await client.getOrCreateConversation({ locationId, contactId });

	await setConversationGhlLink({
		subaccountId: message.subaccountId,
		organizationId: message.organizationId,
		chatId: message.chatId,
		ghlContactId: contactId,
		ghlConversationId: conversation.id,
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
			const openwa = createOpenWaClient();
			const result = await openwa.sendText(session.openwaSessionId, {
				chatId: message.chatId,
				text: message.body ?? "",
			});
			return { waMessageId: result?.id ?? null };
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
				});
				return { ghlMessageId: res.messageId ?? res.message?.id ?? null };
			} catch (error) {
				logger.error(error, { ctx: "messaging.fanOut.recordGhlOutbound", chatId: message.chatId });
				return null;
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
