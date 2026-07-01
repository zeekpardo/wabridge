import { getConversation, getDefaultSession, getWhatsAppSession } from "@repo/database";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface MessageMedia {
	kind: string;
	/** A data URL for images and voice/audio, or null for non-inlined media. */
	dataUrl: string | null;
	/** The source MIME type (e.g. audio/ogg), when known — drives the player. */
	mimetype: string | null;
}

export interface HistoryMessage {
	id: string;
	waMessageId: string | null;
	direction: "inbound" | "outbound";
	body: string | null;
	type: string;
	status: string | null;
	timestamp: Date;
	fromMe: boolean;
	chatId: string;
	media: MessageMedia | null;
}

const MEDIA_TYPES = new Set(["image", "video", "sticker", "audio", "ptt", "voice", "document"]);

/**
 * Split a message into its caption text and media. With includeMedia, OpenWA
 * returns `media: { mimetype, data(base64) }`; `body` is the caption. We inline
 * images (thumbnails) and voice/audio (playable in the thread) as data URLs;
 * video/docs get a placeholder rather than shipping multi-MB base64 to the
 * browser. Voice notes are small, so playing them inline is worth the bytes.
 */
function extractMedia(
	type: string,
	body: string | undefined,
	media: { mimetype?: string; data?: string } | null | undefined,
): { body: string | null; media: MessageMedia | null } {
	let text = typeof body === "string" && body.length > 0 ? body : null;
	// Guard against raw base64 leaking into the caption.
	if (text && text.length > 100 && (text.startsWith("/9j/") || text.startsWith("iVBOR"))) {
		text = null;
	}
	if (!MEDIA_TYPES.has(type)) {
		return { body: text, media: null };
	}
	const mimetype = media?.mimetype ?? "";
	const inlineable = mimetype.startsWith("image/") || mimetype.startsWith("audio/");
	const dataUrl = media?.data && inlineable ? `data:${mimetype};base64,${media.data}` : null;
	return { body: text, media: { kind: type, dataUrl, mimetype: mimetype || null } };
}

export const getChatHistory = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/history",
		tags: ["WhatsApp"],
		summary: "Fetch a chat's WhatsApp history",
		description:
			"Reads the real message history for a contact live from WhatsApp (via OpenWA), so past conversations show even for contacts never messaged through WABridge.",
	})
	.input(
		z.object({
			chatId: z.string(),
			limit: z.number().int().min(1).max(200).optional(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		// Which number owns this chat: the conversation's active number, else the default.
		const conversation = await getConversation(subaccount.id, input.chatId);
		const sender = conversation?.activeSessionId
			? await getWhatsAppSession(subaccount.id, conversation.activeSessionId)
			: await getDefaultSession(subaccount.id);

		if (!sender) {
			return [] as HistoryMessage[];
		}

		const openwa = createOpenWaClient();
		let history: Awaited<ReturnType<typeof openwa.getChatHistory>>;
		try {
			history = await openwa.getChatHistory(
				sender.openwaSessionId,
				input.chatId,
				input.limit ?? 40,
				true,
			);
		} catch {
			return [] as HistoryMessage[];
		}

		return history
			.map<HistoryMessage>((message) => {
				const { body, media } = extractMedia(message.type ?? "text", message.body, message.media);
				return {
					id: message.id,
					waMessageId: message.id,
					direction: message.fromMe ? "outbound" : "inbound",
					body,
					type: message.type ?? "text",
					status: null,
					timestamp: new Date(message.timestamp * 1000),
					fromMe: message.fromMe,
					chatId: input.chatId,
					media,
				};
			})
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	});
