import {
	createWhatsAppMessage,
	getDefaultSession,
	getGhlConnection,
	getMessageByGhlMessageId,
	getMessageByWaMessageId,
	getWhatsAppSession,
	markMessageGhlSynced,
} from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";

import type { CanonicalMessage, FanOutDeps } from "./fan-out";

/** `15551234567@c.us` → `+15551234567` for GHL contact matching. */
function phoneFromChatId(chatId: string): string | null {
	const digits = chatId.replace(/@.*/, "").replace(/\D/g, "");
	return digits.length >= 6 ? `+${digits}` : null;
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

		async pushGhlInbound(message) {
			const [client, connection] = await Promise.all([
				createGoHighLevelClient(message.subaccountId),
				getGhlConnection(message.subaccountId),
			]);
			if (!client || !connection) {
				return null;
			}
			const phone = phoneFromChatId(message.chatId);
			if (!phone) {
				return null;
			}
			const contact = await client.upsertContact({ phone, locationId: connection.locationId });
			const res = await client.postInboundMessage({
				// SMS-replace (Option B): no conversationProviderId.
				locationId: connection.locationId,
				contactId: contact.id,
				message: message.body ?? "",
				attachments: message.attachments,
				direction: "inbound",
				type: "SMS",
			});
			return { ghlMessageId: res.messageId ?? res.message?.id ?? null };
		},

		async recordGhlOutbound(message) {
			const [client, connection] = await Promise.all([
				createGoHighLevelClient(message.subaccountId),
				getGhlConnection(message.subaccountId),
			]);
			if (!client || !connection) {
				return null;
			}
			const phone = phoneFromChatId(message.chatId);
			if (!phone) {
				return null;
			}
			const contact = await client.upsertContact({ phone, locationId: connection.locationId });
			const res = await client.postOutboundMessageRecord({
				locationId: connection.locationId,
				contactId: contact.id,
				message: message.body ?? "",
				attachments: message.attachments,
				direction: "outbound",
				type: "SMS",
			});
			return { ghlMessageId: res.messageId ?? res.message?.id ?? null };
		},

		async markSynced(id, ghlMessageId) {
			await markMessageGhlSynced(id, ghlMessageId);
		},

		notifyApp() {
			// The embedded messenger already polls; a realtime channel can hook here.
		},
	};
}
