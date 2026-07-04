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
	/** The acting staff user who triggered the send (app or embedded SSO). */
	sentByUserId?: string | null;
	/** Denormalized display name of the sender, for the thread avatar/tooltip. */
	sentByName?: string | null;
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

		let result: { messageId?: string; id?: string };
		if (action.kind === "text") {
			result = await openwa.sendText(target.openwaSessionId, {
				chatId: target.chatId,
				text: action.text ?? "",
			});
		} else if (action.kind === "contact") {
			result = await openwa.sendContact(target.openwaSessionId, {
				chatId: target.chatId,
				contactName: action.contactName ?? "",
				contactNumber: action.contactNumber ?? "",
			});
		} else if (action.kind === "location") {
			result = await openwa.sendLocation(target.openwaSessionId, {
				chatId: target.chatId,
				latitude: action.latitude ?? 0,
				longitude: action.longitude ?? 0,
				description: action.text,
				address: action.address,
			});
		} else {
			result = await openwa.sendMedia(target.openwaSessionId, action.kind as OpenWaMediaKind, {
				chatId: target.chatId,
				url: action.url,
				base64: action.base64,
				mimetype: action.mimetype,
				filename: action.filename,
				caption: action.text,
			});
		}

		// A readable body for the thread/CRM log — the caption/name/label per kind.
		const bodyText =
			action.kind === "contact"
				? (action.contactName ?? null)
				: action.kind === "location"
					? (action.text ??
						action.address ??
						`${action.latitude ?? ""}, ${action.longitude ?? ""}`)
					: (action.text ?? null);

		const waMessageId = result?.messageId ?? result?.id ?? null;
		const timestamp = new Date();
		const row = await createWhatsAppMessage({
			subaccountId: target.subaccountId,
			organizationId: target.organizationId,
			sessionId: target.sessionRowId,
			direction: "outbound",
			chatId: target.chatId,
			fromMe: true,
			type: action.kind,
			body: bodyText,
			status: "sent",
			waMessageId,
			// Sent from our app (messenger/API) — drives the hub's CRM mirroring.
			origin: "app",
			sentByUserId: target.sentByUserId ?? null,
			sentByName: target.sentByName ?? null,
			timestamp,
		});

		messages.push({
			id: row.id,
			waMessageId,
			body: bodyText,
			type: action.kind,
			timestamp,
		});
	}

	return { sent: messages.length, messages };
}
