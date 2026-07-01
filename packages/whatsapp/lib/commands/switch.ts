export interface SwitchParse {
	kind: "switch" | "switch_unique";
	priority: number;
	/** The one-off message body (switch_unique only). */
	message?: string;
}

// #switch|2            -> persistently route this conversation to number 2
// #switch_unique|2|Hi  -> send just "Hi" from number 2, without changing the default
const SWITCH_RE = /^#switch\|(\d+)\s*$/i;
const SWITCH_UNIQUE_RE = /^#switch_unique\|(\d+)\|([\s\S]+)$/i;

/**
 * Parse a whole-message switch command. `#switch_unique` is checked first since
 * it also begins with `#switch`. Returns null for non-switch messages.
 */
export function parseSwitch(text: string): SwitchParse | null {
	const trimmed = text.trim();

	const unique = trimmed.match(SWITCH_UNIQUE_RE);
	if (unique) {
		return {
			kind: "switch_unique",
			priority: Number.parseInt(unique[1] ?? "0", 10),
			message: unique[2] ?? "",
		};
	}

	const persistent = trimmed.match(SWITCH_RE);
	if (persistent) {
		return { kind: "switch", priority: Number.parseInt(persistent[1] ?? "0", 10) };
	}

	return null;
}
