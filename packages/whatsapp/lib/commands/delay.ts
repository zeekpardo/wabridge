import type { Rng } from "./types";

// !/DELAY/<minMs>/<maxMs>/!  — commonly placed at the end of the message.
const DELAY_RE = /!\/DELAY\/(\d+)\/(\d+)\/!/;

export interface DelayResult {
	text: string;
	delayMs?: number;
}

/**
 * Extract a `!/DELAY/x/y/!` directive: strips it from the text and returns a
 * random delay between x and y (inclusive, milliseconds). Order-tolerant
 * (min/max are sorted). Returns `delayMs: undefined` when absent.
 */
export function extractDelay(text: string, rng: Rng = Math.random): DelayResult {
	const match = text.match(DELAY_RE);
	if (!match) {
		return { text };
	}

	const a = Number.parseInt(match[1] ?? "0", 10);
	const b = Number.parseInt(match[2] ?? "0", 10);
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	const delayMs = lo + Math.floor(rng() * (hi - lo + 1));

	const cleaned = text.replace(DELAY_RE, "").replace(/[ \t]+$/gm, "").trimEnd();
	return { text: cleaned, delayMs };
}
