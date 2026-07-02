import type { GlobalSpintax, Rng } from "./types";

// Inline declaration: !/SPINTAX_A/opt1/opt2/.../SPINTAX_A/!
// The trailing newline (if any) is consumed so declaration lines vanish cleanly.
// Names are alphanumeric + underscore so global variables can be given readable
// names (e.g. SPINTAX_GREETING, SPINTAX_FIRST_LINE), not just A-Z / 1-6.
const INLINE_DECL = /!\/SPINTAX_([A-Z0-9_]+)\/([\s\S]*?)\/SPINTAX_\1\/!\r?\n?/g;

// Usage token: ${SPINTAX_A} / ${SPINTAX_1} / ${SPINTAX_GREETING}
const USAGE = /\$\{SPINTAX_([A-Z0-9_]+)\}/g;

function pick(options: string[], rng: Rng): string {
	if (options.length === 0) {
		return "";
	}
	const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
	return options[index] ?? "";
}

export interface SpintaxResult {
	text: string;
	/** SPINTAX_ tokens that had no definition and were stripped. */
	unresolved: string[];
}

/**
 * Expand spintax in a message.
 *
 * - Message-level: `!/SPINTAX_X/a/b/c/SPINTAX_X/!` declares variable X with
 *   options [a,b,c]; the declaration is stripped from the output.
 * - Global: variables passed in `globals` (e.g. SPINTAX_1..6 from settings).
 * - Usage `${SPINTAX_X}` is replaced by a random option. Message-level
 *   declarations win over globals for the same name.
 * - Undefined `${SPINTAX_X}` tokens are STRIPPED (never delivered literally)
 *   and reported in `unresolved` so callers can warn.
 */
export function expandSpintax(
	text: string,
	globals: GlobalSpintax = {},
	rng: Rng = Math.random,
): SpintaxResult {
	const vars: GlobalSpintax = { ...globals };

	const withoutDecls = text.replace(INLINE_DECL, (_match, name: string, body: string) => {
		vars[`SPINTAX_${name}`] = body.split("/");
		return "";
	});

	const unresolved = new Set<string>();
	const substituted = withoutDecls.replace(USAGE, (_match, name: string) => {
		const options = vars[`SPINTAX_${name}`];
		if (!options || options.length === 0) {
			unresolved.add(`SPINTAX_${name}`);
			return "";
		}
		return pick(options, rng);
	});

	// Collapse whitespace left by stripped tokens (spaces/tabs only; keep newlines).
	const cleaned = substituted.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "");

	return { text: cleaned, unresolved: [...unresolved] };
}

/** True if the text contains any spintax declaration or usage token. */
export function hasSpintax(text: string): boolean {
	return /!\/SPINTAX_|\$\{SPINTAX_/.test(text);
}
