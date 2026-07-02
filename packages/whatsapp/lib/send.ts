import { createWhatsAppMessage } from "@repo/database";

import type { ProcessedMessage } from "./commands/types";
import { createOpenWaClient, type OpenWaMediaKind } from "./openwa-client";

/** Hard cap so an in-request delay can't hang the caller indefinitely. */
const MAX_DELAY_MS = 15_000;

export interface SendTarget {
	/** The OpenWA session id that will send. */
	openwaSessionId: string;
	/** The WhatsAppSession row id (for message logging). */
	sessionRowId: string;
	/** The subaccount that owns the sending number. */
	subaccountId: string;
	/** The owning agency organization (denormalized for admin queries). */
	organizationId: string;
	/** Destination chat id, e.g. `15551234567@c.us`. */
	chatId: string;
}

/** One persisted outbound message row (for downstream projections, e.g. CRM mirroring). */
export interface SentMessage {
	/** The WhatsAppMessage row id. */
	id: string;
	waMessageId: string | null;
	body: string | null;
	type: string;
	timestamp: Date;
}

export interface SendResult {
	sent: number;
	/** The persisted rows, in send order. */
	messages: SentMessage[];
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a processed message's send-actions in order against OpenWA, honouring
 * per-action delays, routing media to the right endpoint, and logging each as an
 * outbound message (deduped on waMessageId against the message.sent echo).
 */
export async function sendProcessedMessage(
	target: SendTarget,
	processed: ProcessedMessage,
): Promise<SendResult> {
	const openwa = createOpenWaClient();
	const messages: SentMessage[] = [];

	for (const action of processed.actions) {
		if (action.delayMs && action.delayMs > 0) {
			await sleep(Math.min(action.delayMs, MAX_DELAY_MS));
		}

		const result =
			action.kind === "text"
				? await openwa.sendText(target.openwaSessionId, {
						chatId: target.chatId,
						text: action.text ?? "",
					})
				: await openwa.sendMedia(target.openwaSessionId, action.kind as OpenWaMediaKind, {
						chatId: target.chatId,
						url: action.url,
						base64: action.base64,
						mimetype: action.mimetype,
						filename: action.filename,
						caption: action.text,
					});

		const timestamp = new Date();
		const row = await createWhatsAppMessage({
			subaccountId: target.subaccountId,
			organizationId: target.organizationId,
			sessionId: target.sessionRowId,
			direction: "outbound",
			chatId: target.chatId,
			fromMe: true,
			type: action.kind,
			body: action.text ?? null,
			status: "sent",
			waMessageId: result?.messageId ?? result?.id ?? null,
			// Sent from our app (messenger/API) — drives the hub's CRM mirroring.
			origin: "app",
			timestamp,
		});

		messages.push({
			id: row.id,
			waMessageId: result?.messageId ?? result?.id ?? null,
			body: action.text ?? null,
			type: action.kind,
			timestamp,
		});
	}

	return { sent: messages.length, messages };
}
