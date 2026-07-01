import { describe, expect, it } from "vitest";

import { extractDelay } from "./delay";
import { processMessage } from "./process";
import { expandSpintax } from "./spintax";

// Deterministic RNG helpers.
const first: () => number = () => 0; // always picks the first option / low end
const last: () => number = () => 0.999999; // always picks the last option / high end

describe("expandSpintax", () => {
	it("expands an inline declaration and strips it", () => {
		const input = "!/SPINTAX_A/Hello/Hi/Hey/SPINTAX_A/!\n${SPINTAX_A} there";
		expect(expandSpintax(input, {}, first)).toBe("Hello there");
		expect(expandSpintax(input, {}, last)).toBe("Hey there");
	});

	it("expands global spintax variables", () => {
		const globals = { SPINTAX_1: ["Good morning", "Hi"] };
		expect(expandSpintax("${SPINTAX_1}, team", globals, first)).toBe("Good morning, team");
	});

	it("lets an inline declaration override a global of the same name", () => {
		const globals = { SPINTAX_A: ["global"] };
		const input = "!/SPINTAX_A/local/SPINTAX_A/!${SPINTAX_A}";
		expect(expandSpintax(input, globals, first)).toBe("local");
	});

	it("leaves unknown variables untouched", () => {
		expect(expandSpintax("${SPINTAX_Z} end", {}, first)).toBe("${SPINTAX_Z} end");
	});

	it("handles multiple variables in one message", () => {
		const input =
			"!/SPINTAX_A/Hello/Hi/SPINTAX_A/!\n!/SPINTAX_B/team/all/SPINTAX_B/!\n${SPINTAX_A} ${SPINTAX_B}";
		expect(expandSpintax(input, {}, first)).toBe("Hello team");
	});
});

describe("extractDelay", () => {
	it("extracts and strips a delay directive", () => {
		const result = extractDelay("Hello there !/DELAY/1000/6000/!", first);
		expect(result.text).toBe("Hello there");
		expect(result.delayMs).toBe(1000);
	});

	it("picks within the range and is order-tolerant", () => {
		expect(extractDelay("Hi !/DELAY/6000/2000/!", last).delayMs).toBe(6000);
		expect(extractDelay("Hi !/DELAY/2000/6000/!", first).delayMs).toBe(2000);
	});

	it("returns undefined delay when absent", () => {
		expect(extractDelay("plain message").delayMs).toBeUndefined();
	});
});

describe("processMessage", () => {
	it("produces a single text action for a plain message", () => {
		const result = processMessage({ text: "Hello" });
		expect(result.actions).toEqual([{ kind: "text", text: "Hello", delayMs: undefined }]);
		expect(result.meta.controlOnly).toBe(false);
	});

	it("applies spintax + delay together", () => {
		const result = processMessage({
			text: "!/SPINTAX_A/Hi/Yo/SPINTAX_A/!${SPINTAX_A}! !/DELAY/1000/6000/!",
			rng: first,
		});
		expect(result.actions).toHaveLength(1);
		expect(result.actions[0]?.text).toBe("Hi!");
		expect(result.actions[0]?.delayMs).toBe(1000);
		expect(result.meta.spintaxApplied).toBe(true);
	});

	it("routes attachments by mime type and uses text as the first caption", () => {
		const result = processMessage({
			text: "Check this out",
			attachments: [
				{ url: "https://x/a.jpg", mimetype: "image/jpeg" },
				{ url: "https://x/b.pdf", mimetype: "application/pdf" },
			],
		});
		expect(result.actions).toHaveLength(2);
		expect(result.actions[0]).toMatchObject({ kind: "image", text: "Check this out" });
		expect(result.actions[1]).toMatchObject({ kind: "document", text: undefined });
	});

	it("marks a message that produces no content as controlOnly", () => {
		const result = processMessage({ text: "" });
		expect(result.actions).toHaveLength(0);
		expect(result.meta.controlOnly).toBe(true);
	});

	it("parses #switch|N as a control-only number override", () => {
		const result = processMessage({ text: "#switch|2" });
		expect(result.actions).toHaveLength(0);
		expect(result.meta.controlOnly).toBe(true);
		expect(result.numberOverride).toEqual({ priority: 2, scope: "session" });
	});

	it("parses #switch_unique|N|msg into a one-off from that number, with spintax", () => {
		const result = processMessage({
			text: "#switch_unique|3|!/SPINTAX_A/Hi/Yo/SPINTAX_A/!${SPINTAX_A}",
			rng: first,
		});
		expect(result.numberOverride).toEqual({ priority: 3, scope: "once" });
		expect(result.actions).toHaveLength(1);
		expect(result.actions[0]?.text).toBe("Hi");
	});
});
