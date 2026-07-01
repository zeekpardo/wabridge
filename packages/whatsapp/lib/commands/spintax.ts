import type { GlobalSpintax, Rng } from "./types";

// Inline declaration: !/SPINTAX_A/opt1/opt2/.../SPINTAX_A/!
// The trailing newline (if any) is consumed so declaration lines vanish cleanly.
const INLINE_DECL = /!\/SPINTAX_([A-Z0-9]+)\/([\s\S]*?)\/SPINTAX_\1\/!\r?\n?/g;

// Usage token: ${SPINTAX_A} / ${SPINTAX_1}
const USAGE = /\$\{SPINTAX_([A-Z0-9]+)\}/g;

function pick(options: string[], rng: Rng): string {
	if (options.length === 0) {
		return "";
	}
	const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
	return options[index] ?? "";
}

/**
 * Expand spintax in a message.
 *
 * - Message-level: `!/SPINTAX_X/a/b/c/SPINTAX_X/!` declares variable X with
 *   options [a,b,c]; the declaration is stripped from the output.
 * - Global: variables passed in `globals` (e.g. SPINTAX_1..6 from settings).
 * - Usage `${SPINTAX_X}` is replaced by a random option. Message-level
 *   declarations win over globals for the same name. Unknown variables are
 *   left untouched.
 */
export function expandSpintax(
	text: string,
	globals: GlobalSpintax = {},
	rng: Rng = Math.random,
): string {
	const vars: GlobalSpintax = { ...globals };

	const withoutDecls = text.replace(INLINE_DECL, (_match, name: string, body: string) => {
		vars[`SPINTAX_${name}`] = body.split("/");
		return "";
	});

	return withoutDecls.replace(USAGE, (match, name: string) => {
		const options = vars[`SPINTAX_${name}`];
		if (!options || options.length === 0) {
			return match;
		}
		return pick(options, rng);
	});
}

/** True if the text contains any spintax declaration or usage token. */
export function hasSpintax(text: string): boolean {
	return /!\/SPINTAX_|\$\{SPINTAX_/.test(text);
}
