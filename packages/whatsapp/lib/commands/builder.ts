/**
 * Structured composer model: a message is a sequence of segments (plain text,
 * a spintax variable, or a delay). The UI renders these as text + chips; this
 * module compiles them into the raw command string the parser understands, so
 * users never type `!/SPINTAX_…/!` by hand.
 */
export type MessageSegment =
	| { type: "text"; value: string }
	| { type: "spintax"; options: string[] }
	| { type: "delay"; minMs: number; maxMs: number };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A `/` would collide with the spintax option delimiter — soften it to a space. */
function sanitizeOption(option: string): string {
	return option.replace(/\//g, " ").trim();
}

/**
 * Compile composer segments into a raw command string.
 *
 * - Each spintax segment gets its own letter (A, B, …) and is emitted as an
 *   inline declaration immediately followed by its usage, e.g.
 *   `!/SPINTAX_A/a/b/SPINTAX_A/!${SPINTAX_A}` — the parser strips the
 *   declaration and resolves the usage.
 * - A single trailing `!/DELAY/min/max/!` is appended (last delay wins, since
 *   the parser only honours one).
 */
export function buildCommandString(segments: MessageSegment[]): string {
	let letterIndex = 0;
	let out = "";
	let delay: { minMs: number; maxMs: number } | null = null;

	for (const segment of segments) {
		if (segment.type === "text") {
			out += segment.value;
			continue;
		}
		if (segment.type === "spintax") {
			const options = segment.options.map(sanitizeOption).filter((option) => option.length > 0);
			if (options.length === 0) {
				continue;
			}
			const letter = LETTERS[letterIndex % LETTERS.length];
			letterIndex++;
			out += `!/SPINTAX_${letter}/${options.join("/")}/SPINTAX_${letter}/!\${SPINTAX_${letter}}`;
			continue;
		}
		// delay
		delay = { minMs: segment.minMs, maxMs: segment.maxMs };
	}

	if (delay) {
		out += ` !/DELAY/${Math.round(delay.minMs)}/${Math.round(delay.maxMs)}/!`;
	}

	return out;
}
