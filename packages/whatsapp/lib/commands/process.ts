import { extractDelay } from "./delay";
import { expandSpintax } from "./spintax";
import type { ProcessInput, ProcessedMessage, SendAction, SendActionKind } from "./types";

function mediaKind(mimetype?: string): SendActionKind {
	if (!mimetype) {
		return "document";
	}
	if (mimetype.startsWith("image/")) {
		return "image";
	}
	if (mimetype.startsWith("video/")) {
		return "video";
	}
	if (mimetype.startsWith("audio/")) {
		return "audio";
	}
	return "document";
}

/**
 * Process an outbound message's commands into concrete send-actions.
 *
 * Phase 1 handles: Spintax expansion, `!/DELAY/x/y/!`, and media attachments
 * (routed to the right send kind by MIME type; the text becomes the caption of
 * the first attachment). Number-switching and buttons are layered in later
 * phases via `numberOverride` / additional action kinds.
 */
export function processMessage(input: ProcessInput): ProcessedMessage {
	const rng = input.rng ?? Math.random;
	const originalText = input.text ?? "";

	const expanded = expandSpintax(originalText, input.globals ?? {}, rng);
	const { text, delayMs } = extractDelay(expanded, rng);

	const attachments = input.attachments ?? [];
	const actions: SendAction[] = [];

	if (attachments.length > 0) {
		attachments.forEach((attachment, index) => {
			const first = index === 0;
			actions.push({
				kind: mediaKind(attachment.mimetype),
				url: attachment.url,
				filename: attachment.filename,
				mimetype: attachment.mimetype,
				text: first && text ? text : undefined,
				delayMs: first ? delayMs : undefined,
			});
		});
	} else if (text.length > 0) {
		actions.push({ kind: "text", text, delayMs });
	}

	return {
		actions,
		meta: {
			spintaxApplied: text !== originalText,
			delayMs,
			controlOnly: actions.length === 0,
		},
	};
}
