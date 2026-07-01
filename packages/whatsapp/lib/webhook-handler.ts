import {
	createWhatsAppMessage,
	getWhatsAppSessionByOpenwaSessionId,
	touchConversationOutbound,
	updateWhatsAppMessageStatus,
	updateWhatsAppSession,
	upsertConversationInbound,
} from "@repo/database";
import { logger } from "@repo/logs";

import { OPENWA_WEBHOOK_EVENTS } from "./types";
import { parseOpenWaWebhookPayload, verifyOpenWaSignature } from "./webhook";

/**
 * Public inbound webhook handler for OpenWA -> us deliveries. Mirrors the
 * payments webhook handler style: reads the raw body, verifies the
 * `X-OpenWA-Signature` HMAC against the target session's stored secret, then
 * processes the event. Returns a `Response`.
 */
export async function webhookHandler(req: Request): Promise<Response> {
	const rawBody = await req.text();

	if (!rawBody) {
		return new Response("Invalid request.", { status: 400 });
	}

	let payload: ReturnType<typeof parseOpenWaWebhookPayload>;
	try {
		payload = parseOpenWaWebhookPayload(rawBody);
	} catch (error) {
		logger.error(error, { ctx: "whatsapp.webhook.parse" });
		return new Response("Invalid request.", { status: 400 });
	}

	const row = await getWhatsAppSessionByOpenwaSessionId(payload.sessionId);

	if (!row) {
		// Unknown session — acknowledge without processing to avoid retries.
		return new Response("Unknown session.", { status: 404 });
	}

	const signatureValid = verifyOpenWaSignature(
		row.webhookSecret,
		rawBody,
		req.headers.get("X-OpenWA-Signature"),
	);

	if (!signatureValid) {
		return new Response("Invalid signature.", { status: 401 });
	}

	try {
		await processEvent(row.id, row.subaccountId, row.organizationId, payload);
	} catch (error) {
		logger.error(error, { ctx: "whatsapp.webhook.process", event: payload.event });
		return new Response("Processing error.", { status: 500 });
	}

	return new Response("OK", { status: 200 });
}

async function processEvent(
	sessionId: string,
	subaccountId: string,
	organizationId: string,
	payload: ReturnType<typeof parseOpenWaWebhookPayload>,
): Promise<void> {
	const data = payload.data as Record<string, unknown>;

	switch (payload.event) {
		case OPENWA_WEBHOOK_EVENTS.messageReceived:
		case OPENWA_WEBHOOK_EVENTS.messageSent: {
			// message.received => inbound; message.sent => outbound (fromMe, whether
			// sent through our API or directly from the linked phone). Dedup on
			// waMessageId (in createWhatsAppMessage) collapses the API-send row and
			// its message.sent webhook echo into one.
			const outbound = payload.event === OPENWA_WEBHOOK_EVENTS.messageSent;
			const chatId = String(data.chatId ?? "");
			const body = typeof data.body === "string" ? data.body : null;
			const type = String(data.type ?? "text");

			await createWhatsAppMessage({
				subaccountId,
				organizationId,
				sessionId,
				direction: outbound ? "outbound" : "inbound",
				chatId,
				fromMe: outbound ? true : Boolean(data.fromMe ?? false),
				type,
				body,
				status: typeof data.status === "string" ? data.status : outbound ? "sent" : null,
				waMessageId: typeof data.id === "string" ? data.id : null,
				idempotencyKey: payload.idempotencyKey,
				timestamp: parseTimestamp(payload.timestamp),
			});

			// Keep the conversation thread fresh. Inbound reply-locks the thread to
			// the receiving number; outbound just refreshes it.
			if (chatId) {
				const preview = body ? body.slice(0, 140) : `[${type}]`;
				if (outbound) {
					await touchConversationOutbound({
						subaccountId,
						organizationId,
						chatId,
						sessionId,
						preview,
					});
				} else {
					const contactName =
						typeof data.pushName === "string"
							? data.pushName
							: typeof data.notifyName === "string"
								? data.notifyName
								: null;
					await upsertConversationInbound({
						subaccountId,
						organizationId,
						chatId,
						sessionId,
						preview,
						contactName,
					});
				}
			}
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.messageAck: {
			// Delivery/read receipt for a message we already have — update its status.
			const waMessageId = typeof data.id === "string" ? data.id : null;
			const status = typeof data.status === "string" ? data.status : null;
			if (waMessageId && status) {
				await updateWhatsAppMessageStatus(sessionId, waMessageId, status);
			}
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.sessionStatus:
		case OPENWA_WEBHOOK_EVENTS.sessionAuthenticated:
		case OPENWA_WEBHOOK_EVENTS.sessionDisconnected: {
			const status = typeof data.status === "string" ? data.status : undefined;
			await updateWhatsAppSession(subaccountId, sessionId, {
				...(status ? { status } : {}),
				...(payload.event === OPENWA_WEBHOOK_EVENTS.sessionAuthenticated
					? { needsQr: false, connectedAt: new Date() }
					: {}),
				...(typeof data.phone === "string" ? { phone: data.phone } : {}),
				...(typeof data.jid === "string" ? { jid: data.jid } : {}),
			});
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.sessionQr: {
			await updateWhatsAppSession(subaccountId, sessionId, { needsQr: true });
			break;
		}
		default:
			// Any unhandled event types are acknowledged as no-ops.
			break;
	}
}

function parseTimestamp(value: string): Date {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
