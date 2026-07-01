import { describe, expect, it, vi } from "vitest";

import { type CanonicalMessage, type FanOutDeps, fanOutMessage, planProjections } from "./fan-out";

function baseMessage(overrides: Partial<CanonicalMessage> = {}): CanonicalMessage {
	return {
		subaccountId: "sub1",
		organizationId: "org1",
		sessionId: "sess1",
		chatId: "15551234567@c.us",
		direction: "inbound",
		origin: "contact",
		body: "hi",
		type: "text",
		timestamp: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

function mockDeps(overrides: Partial<FanOutDeps> = {}): FanOutDeps {
	return {
		findByWaMessageId: vi.fn().mockResolvedValue(null),
		findByGhlMessageId: vi.fn().mockResolvedValue(null),
		persist: vi.fn().mockResolvedValue({ id: "row1" }),
		sendOverWhatsApp: vi.fn().mockResolvedValue({ waMessageId: "wa_sent" }),
		pushGhlInbound: vi.fn().mockResolvedValue({ ghlMessageId: "ghl_in" }),
		recordGhlOutbound: vi.fn().mockResolvedValue({ ghlMessageId: "ghl_out" }),
		markSynced: vi.fn().mockResolvedValue(undefined),
		notifyApp: vi.fn(),
		...overrides,
	};
}

describe("planProjections (the coexistence contract)", () => {
	it("contact → GHL inbound + app, never re-sends", () => {
		expect(planProjections("contact")).toEqual({
			sendOverWhatsApp: false,
			pushGhlInbound: true,
			recordGhlOutbound: false,
			notifyApp: true,
		});
	});

	it("ghl → send over WhatsApp, never re-posts to GHL", () => {
		expect(planProjections("ghl")).toEqual({
			sendOverWhatsApp: true,
			pushGhlInbound: false,
			recordGhlOutbound: false,
			notifyApp: true,
		});
	});

	it("app → send over WhatsApp + record outbound in GHL", () => {
		expect(planProjections("app")).toEqual({
			sendOverWhatsApp: true,
			pushGhlInbound: false,
			recordGhlOutbound: true,
			notifyApp: true,
		});
	});
});

describe("fanOutMessage", () => {
	it("contact: persists, mirrors inbound to GHL, does not send", async () => {
		const deps = mockDeps();
		const result = await fanOutMessage(baseMessage({ waMessageId: "wa1" }), deps);

		expect(deps.sendOverWhatsApp).not.toHaveBeenCalled();
		expect(deps.persist).toHaveBeenCalledOnce();
		expect(deps.pushGhlInbound).toHaveBeenCalledOnce();
		expect(deps.markSynced).toHaveBeenCalledWith("row1", "ghl_in");
		expect(result).toMatchObject({ deduped: false, messageId: "row1", ghlMessageId: "ghl_in" });
	});

	it("ghl: sends over WhatsApp and does NOT re-post to GHL", async () => {
		const deps = mockDeps();
		const result = await fanOutMessage(
			baseMessage({ origin: "ghl", direction: "outbound", ghlMessageId: "g1", waMessageId: null }),
			deps,
		);

		expect(deps.sendOverWhatsApp).toHaveBeenCalledOnce();
		expect(deps.pushGhlInbound).not.toHaveBeenCalled();
		expect(deps.recordGhlOutbound).not.toHaveBeenCalled();
		expect(result.waMessageId).toBe("wa_sent");
	});

	it("app: sends over WhatsApp AND records the outbound in GHL", async () => {
		const deps = mockDeps();
		await fanOutMessage(baseMessage({ origin: "app", direction: "outbound" }), deps);

		expect(deps.sendOverWhatsApp).toHaveBeenCalledOnce();
		expect(deps.recordGhlOutbound).toHaveBeenCalledOnce();
		expect(deps.markSynced).toHaveBeenCalledWith("row1", "ghl_out");
	});

	it("de-dupes on waMessageId (WhatsApp echo) without persisting or projecting", async () => {
		const deps = mockDeps({ findByWaMessageId: vi.fn().mockResolvedValue({ id: "existing" }) });
		const result = await fanOutMessage(baseMessage({ waMessageId: "wa1" }), deps);

		expect(result).toEqual({ deduped: true, messageId: "existing" });
		expect(deps.persist).not.toHaveBeenCalled();
		expect(deps.pushGhlInbound).not.toHaveBeenCalled();
	});

	it("de-dupes on ghlMessageId (GHL redelivery)", async () => {
		const deps = mockDeps({ findByGhlMessageId: vi.fn().mockResolvedValue({ id: "existing" }) });
		const result = await fanOutMessage(
			baseMessage({ origin: "ghl", direction: "outbound", ghlMessageId: "g1", waMessageId: null }),
			deps,
		);

		expect(result.deduped).toBe(true);
		expect(deps.sendOverWhatsApp).not.toHaveBeenCalled();
		expect(deps.persist).not.toHaveBeenCalled();
	});
});
