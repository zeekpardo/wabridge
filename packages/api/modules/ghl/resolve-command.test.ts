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

	it("returns no numberOverride for a plain message", () => {
		expect(resolveOutboundCommand("just a normal reply").numberOverride).toBeUndefined();
	});

	it("resolves #switch|N to a session-scoped number override (control-only, no text)", () => {
		const result = resolveOutboundCommand("#switch|2");
		expect(result.numberOverride).toEqual({ priority: 2, scope: "session" });
		// A bare #switch changes the active number and sends nothing.
		expect(result.text).toBe("");
	});

	it("resolves #switch_unique to a once-scoped override and keeps the inner message", () => {
		const result = resolveOutboundCommand("#switch_unique|3|On my way", {}, () => 0);
		expect(result.numberOverride).toEqual({ priority: 3, scope: "once" });
		expect(result.text).toBe("On my way");
	});

	it("distinguishes session (#switch) from unique (#switch_unique) scope", () => {
		expect(resolveOutboundCommand("#switch|1").numberOverride?.scope).toBe("session");
		expect(resolveOutboundCommand("#switch_unique|1|hi").numberOverride?.scope).toBe("once");
	});
});
