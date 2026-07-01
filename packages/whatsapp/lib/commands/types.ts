/** A pseudo-random source, injectable so parsing is deterministic in tests. */
export type Rng = () => number;

/** Global spintax variables (e.g. SPINTAX_1..6), each a list of variations. */
export type GlobalSpintax = Record<string, string[]>;

/** An outbound attachment to send alongside/instead of text. */
export interface CommandAttachment {
	url: string;
	mimetype?: string;
	filename?: string;
}

export type SendActionKind = "text" | "image" | "video" | "audio" | "document";

/** One concrete thing to send, after commands have been processed. */
export interface SendAction {
	kind: SendActionKind;
	/** Body for `text`; caption for media kinds. */
	text?: string;
	/** Media source URL (media kinds only). */
	url?: string;
	filename?: string;
	mimetype?: string;
	/** Milliseconds to wait before sending this action (from !/DELAY/x/y/!). */
	delayMs?: number;
}

/** How the sender number should be overridden for this message (Phase 2). */
export interface NumberOverride {
	/** Priority of the target number (1 = highest). */
	priority: number;
	/** `session` = persist for the conversation; `once` = this message only. */
	scope: "session" | "once";
}

export interface ProcessedMessage {
	actions: SendAction[];
	numberOverride?: NumberOverride;
	meta: {
		spintaxApplied: boolean;
		delayMs?: number;
		/** A whole-message command that produced no sendable content (e.g. bare #switch). */
		controlOnly?: boolean;
	};
}

export interface ProcessInput {
	text: string;
	attachments?: CommandAttachment[];
	globals?: GlobalSpintax;
	rng?: Rng;
}
