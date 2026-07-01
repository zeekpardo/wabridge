import { beforeAll, describe, expect, it } from "vitest";

import {
	mintEmbeddedToken,
	resolveEmbeddedSession,
	signOAuthState,
	verifyOAuthState,
} from "./embedded-session";

beforeAll(() => {
	process.env.EMBEDDED_JWT_SECRET = "test-embedded-secret-please-change";
});

function headersWithCookie(token: string): Headers {
	return new Headers({ cookie: `wabridge_embedded=${encodeURIComponent(token)}` });
}

describe("embedded session token", () => {
	it("mints and resolves a principal (round trip)", async () => {
		const token = mintEmbeddedToken({
			organizationId: "org1",
			subaccountId: "sub1",
			ghlUserId: "u1",
		});
		const principal = await resolveEmbeddedSession(headersWithCookie(token));
		expect(principal).toEqual({ organizationId: "org1", subaccountId: "sub1", ghlUserId: "u1" });
	});

	it("resolves from the x-embedded-token header too", async () => {
		const token = mintEmbeddedToken({ organizationId: "o", subaccountId: "s", ghlUserId: null });
		const principal = await resolveEmbeddedSession(new Headers({ "x-embedded-token": token }));
		expect(principal?.subaccountId).toBe("s");
		expect(principal?.ghlUserId).toBeNull();
	});

	it("rejects a tampered token", async () => {
		const token = mintEmbeddedToken({
			organizationId: "org1",
			subaccountId: "sub1",
			ghlUserId: null,
		});
		const tampered = `${token.slice(0, -2)}xy`;
		expect(await resolveEmbeddedSession(headersWithCookie(tampered))).toBeNull();
	});

	it("rejects a token signed with a different secret", async () => {
		const token = mintEmbeddedToken({
			organizationId: "org1",
			subaccountId: "sub1",
			ghlUserId: null,
		});
		process.env.EMBEDDED_JWT_SECRET = "a-different-secret";
		const principal = await resolveEmbeddedSession(headersWithCookie(token));
		process.env.EMBEDDED_JWT_SECRET = "test-embedded-secret-please-change";
		expect(principal).toBeNull();
	});

	it("returns null when no token is present", async () => {
		expect(await resolveEmbeddedSession(new Headers())).toBeNull();
	});

	it("rejects an expired token", async () => {
		const token = mintEmbeddedToken(
			{ organizationId: "org1", subaccountId: "sub1", ghlUserId: null },
			-1,
		);
		expect(await resolveEmbeddedSession(headersWithCookie(token))).toBeNull();
	});
});

describe("oauth state", () => {
	it("signs and verifies state", () => {
		const token = signOAuthState({ organizationId: "org1", subaccountId: "sub1" });
		expect(verifyOAuthState(token)).toEqual({ organizationId: "org1", subaccountId: "sub1" });
	});

	it("does not accept an embedded token as oauth state (issuer isolation)", () => {
		const embedded = mintEmbeddedToken({ organizationId: "o", subaccountId: "s", ghlUserId: null });
		expect(verifyOAuthState(embedded)).toBeNull();
	});
});
