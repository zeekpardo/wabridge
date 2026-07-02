import { getMessageByWaMessageId } from "@repo/database";
import { createGoHighLevelClient, type GHLMessageStatus } from "@repo/integrations";
import { logger } from "@repo/logs";
import type { OpenWaWebhookHooks } from "@repo/whatsapp";

import { createFanOutDeps } from "./deps";
import { fanOutMessage } from "./fan-out";

/**
 * WhatsApp ack statuses → GHL provider message statuses. Unmapped statuses
 * (e.g. "sent"/"pending") are skipped — GHL treats the message as pending until
 * we report a terminal-ish state.
 */
function toGhlStatus(waStatus: string): GHLMessageStatus | null {
	switch (waStatus) {
		case "delivered":
			return "delivered";
		case "read":
		case "played":
			return "read";
		case "failed":
		case "error":
			return "failed";
		default:
			return null;
	}
}

/**
 * Wires OpenWA webhook events into the message hub. This lives in @repo/api
 * (not @repo/whatsapp) because the hub and the GHL client do — the webhook
 * handler receives these as injected hooks to avoid a package cycle.
 *
 * - Inbound contact messages flow through {@link fanOutMessage}, which persists
 *   them (same waMessageId de-dupe as the direct insert) AND mirrors them into
 *   the connected CRM — the missing half of the SMS takeover.
 * - Delivery acks for CRM-mirrored messages are relayed to GHL's
 *   update-message-status API, which only our provider app token may call.
 */
export function createOpenWaWebhookHooks(): OpenWaWebhookHooks {
	return {
		async onInboundMessage(event) {
			await fanOutMessage(
				{
					subaccountId: event.subaccountId,
					organizationId: event.organizationId,
					sessionId: event.sessionId,
					chatId: event.chatId,
					direction: "inbound",
					origin: "contact",
					body: event.body,
					type: event.type,
					waMessageId: event.waMessageId,
					senderPhone: event.senderPhone ?? null,
					timestamp: event.timestamp,
				},
				createFanOutDeps(),
			);
		},

		// Best-effort by contract: a GHL hiccup must never fail the webhook (the
		// local status update already happened).
		async onMessageAck(event) {
			try {
				const status = toGhlStatus(event.status);
				if (!status) {
					return;
				}
				const message = await getMessageByWaMessageId(event.subaccountId, event.waMessageId);
				if (!message?.ghlMessageId || message.direction !== "outbound") {
					return;
				}
				const client = await createGoHighLevelClient(event.subaccountId);
				if (!client) {
					return;
				}
				await client.updateMessageStatus({ messageId: message.ghlMessageId, status });
			} catch (error) {
				logger.error(error, {
					ctx: "messaging.ackToGhl",
					waMessageId: event.waMessageId,
					status: event.status,
				});
			}
		},
	};
}
