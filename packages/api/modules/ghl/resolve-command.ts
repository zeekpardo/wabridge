import {
	type GlobalSpintax,
	type NumberOverride,
	processMessage,
	type Rng,
	type SendAction,
} from "@repo/whatsapp/commands";

export type { NumberOverride };

export interface ResolvedOutboundCommand {
	/** The concrete text to deliver over WhatsApp (spintax expanded, delay stripped). */
	text: string;
	/** Random pre-send delay (ms) from a `!/DELAY/x/y/!` directive, if any. */
	delayMs?: number;
	/** SPINTAX_ tokens that were undefined and stripped (surface as a warning). */
	unresolved: string[];
	/** Sender-number override from `#switch|N` (session) or `#switch_unique` (once), if any. */
	numberOverride?: NumberOverride;
	/**
	 * A whole-message rich action (contact card / location pin) when the body is
	 * one of those commands — the GHL path sends this instead of text.
	 */
	richAction?: SendAction;
}

/**
 * Resolve a GHL-originated message body's commands (spintax + delay) into the
 * text we actually deliver over WhatsApp.
 *
 * GHL SMS is text-only, so we concatenate any text actions and surface the
 * single delay. Resolving HERE — before the message is persisted/mirrored —
 * means the stored body is the real per-recipient variation, not the raw
 * `!/SPINTAX…/!${SPINTAX…}` template (which is what a bulk send POSTs for every
 * recipient). `rng` is injectable so tests are deterministic.
 */
export function resolveOutboundCommand(
	body: string,
	globals: GlobalSpintax = {},
	rng?: Rng,
): ResolvedOutboundCommand {
	const processed = processMessage({ text: body, globals, rng });

	const text = processed.actions
		.map((action) => action.text ?? "")
		.filter((part) => part.length > 0)
		.join("\n");

	const richAction = processed.actions.find(
		(action) => action.kind === "contact" || action.kind === "location",
	);

	return {
		text,
		delayMs: processed.meta.delayMs,
		unresolved: processed.meta.unresolvedSpintax ?? [],
		numberOverride: processed.numberOverride,
		richAction,
	};
}
