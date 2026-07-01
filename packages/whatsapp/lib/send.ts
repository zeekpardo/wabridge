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
	organizationId: string;
	/** Destination chat id, e.g. `15551234567@c.us`. */
	chatId: string;
}

export interface SendResult {
	sent: number;
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
	let sent = 0;

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
						mimetype: action.mimetype,
						filename: action.filename,
						caption: action.text,
					});

		await createWhatsAppMessage({
			organizationId: target.organizationId,
			sessionId: target.sessionRowId,
			direction: "outbound",
			chatId: target.chatId,
			fromMe: true,
			type: action.kind,
			body: action.text ?? null,
			status: "sent",
			waMessageId: result?.id ?? null,
			timestamp: new Date(),
		});

		sent++;
	}

	return { sent };
}
