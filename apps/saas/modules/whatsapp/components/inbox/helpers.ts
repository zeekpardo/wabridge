/** Turn a WhatsApp chatId into something human-readable. */
export function prettyPhone(chatId: string): string {
	if (chatId.endsWith("@lid")) {
		return "(unknown)";
	}
	const digits = chatId.replace(/@c\.us$/, "").replace(/@s\.whatsapp\.net$/, "");
	return digits ? `+${digits}` : chatId;
}

/** Build a chatId from a raw phone number (digits only). */
export function toChatId(phone: string): string {
	return `${phone.replace(/\D/g, "")}@c.us`;
}

/** Compact relative time, e.g. "now", "5m", "3h", "2d", or a date. */
export function relativeTime(value: string | Date | null | undefined): string {
	if (!value) {
		return "";
	}
	const then = typeof value === "string" ? new Date(value) : value;
	const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
	if (seconds < 60) {
		return "now";
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h`;
	}
	const days = Math.floor(hours / 24);
	if (days < 7) {
		return `${days}d`;
	}
	return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Exact clock time for a message bubble. */
export function messageTime(value: string | Date | null | undefined): string {
	if (!value) {
		return "";
	}
	const then = typeof value === "string" ? new Date(value) : value;
	return then.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export const MESSAGE_TYPES = {
	text: "text",
	image: "image",
	video: "video",
	audio: "audio",
	document: "document",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

/** Guess a mimetype for a media URL, falling back to the chosen message type. */
export function guessMimetype(url: string, type: MessageType): string | undefined {
	const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase();
	if (ext) {
		if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
			return `image/${ext === "jpg" ? "jpeg" : ext}`;
		}
		if (["mp4", "mov", "webm"].includes(ext)) {
			return `video/${ext}`;
		}
		if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
			return `audio/${ext}`;
		}
		if (["pdf"].includes(ext)) {
			return "application/pdf";
		}
	}
	if (type === "image") {
		return "image/jpeg";
	}
	if (type === "video") {
		return "video/mp4";
	}
	if (type === "audio") {
		return "audio/mpeg";
	}
	if (type === "document") {
		return "application/octet-stream";
	}
	return undefined;
}
