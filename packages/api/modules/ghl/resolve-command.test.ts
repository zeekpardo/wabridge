import { describe, expect, it } from "vitest";

import { resolveOutboundCommand } from "./resolve-command";

describe("resolveOutboundCommand", () => {
	it("passes plain text through unchanged", () => {
		const result = resolveOutboundCommand("Hey, are we still on for tomorrow?");
		expect(result.text).toBe("Hey, are we still on for tomorrow?");
		expect(result.delayMs).toBeUndefined();
		expect(result.unresolved).toEqual([]);
	});

	it("resolves inline spintax to one option (deterministic rng)", () => {
		const body = "!/SPINTAX_A/Hi/Hello/Hey/SPINTAX_A/!${SPINTAX_A} there";
		expect(resolveOutboundCommand(body, {}, () => 0).text).toBe("Hi there");
		expect(resolveOutboundCommand(body, {}, () => 0.999999).text).toBe("Hey there");
	});

	it("extracts a delay and strips the directive from the text", () => {
		const result = resolveOutboundCommand("On my way! !/DELAY/1000/4000/!", {}, () => 0);
		expect(result.text).toBe("On my way!");
		expect(result.delayMs).toBe(1000);
	});

	it("applies global spintax variables from settings", () => {
		const globals = { SPINTAX_1: ["morning", "afternoon"] };
		const result = resolveOutboundCommand("Good ${SPINTAX_1}", globals, () => 0);
		expect(result.text).toBe("Good morning");
	});

	it("reports undefined spintax tokens as unresolved", () => {
		const result = resolveOutboundCommand("Hello ${SPINTAX_9}", {}, () => 0);
		expect(result.unresolved).toContain("SPINTAX_9");
	});
});
