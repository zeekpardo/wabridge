import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Embedded auth for the GoHighLevel Custom Page. GHL iframes are third-party, so
 * the first-party better-auth cookie is often blocked. After we verify a GHL SSO
 * payload we mint a short-lived HS256 token that pins the request to a specific
 * agency + subaccount; the oRPC layer accepts it when no session cookie is present.
 *
 * Self-contained HS256 (node:crypto) — no external JWT dependency.
 */

export const EMBEDDED_COOKIE = "wabridge_embedded";
const EMBEDDED_ISSUER = "wabridge:embedded";
const OAUTH_STATE_ISSUER = "wabridge:ghl-oauth-state";

export interface EmbeddedPrincipal {
	organizationId: string;
	subaccountId: string;
	ghlUserId: string | null;
}

export interface OAuthState {
	organizationId: string;
	subaccountId: string | null;
}

function getSecret(): string {
	const secret = process.env.EMBEDDED_JWT_SECRET ?? process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("EMBEDDED_JWT_SECRET (or BETTER_AUTH_SECRET) is required for embedded auth");
	}
	return secret;
}

function b64url(input: Buffer | string): string {
	return Buffer.from(input).toString("base64url");
}

function sign(payload: Record<string, unknown>, issuer: string, ttlSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64url(JSON.stringify({ ...payload, iss: issuer, iat: now, exp: now + ttlSeconds }));
	const data = `${header}.${body}`;
	const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
	return `${data}.${sig}`;
}

function verify(token: string, issuer: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}
	const [header, body, sig] = parts;
	const expected = createHmac("sha256", getSecret())
		.update(`${header}.${body}`)
		.digest("base64url");
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return null;
	}
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	if (payload.iss !== issuer) {
		return null;
	}
	if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
		return null;
	}
	return payload;
}

export function mintEmbeddedToken(principal: EmbeddedPrincipal, ttlSeconds = 60 * 60 * 12): string {
	return sign(
		{
			organizationId: principal.organizationId,
			subaccountId: principal.subaccountId,
			ghlUserId: principal.ghlUserId,
		},
		EMBEDDED_ISSUER,
		ttlSeconds,
	);
}

/** Read + verify the embedded token from the cookie or `x-embedded-token` header. */
export async function resolveEmbeddedSession(headers: Headers): Promise<EmbeddedPrincipal | null> {
	const token =
		headers.get("x-embedded-token") ?? readCookie(headers.get("cookie"), EMBEDDED_COOKIE);
	if (!token) {
		return null;
	}
	const payload = verify(token, EMBEDDED_ISSUER);
	if (
		!payload ||
		typeof payload.organizationId !== "string" ||
		typeof payload.subaccountId !== "string"
	) {
		return null;
	}
	return {
		organizationId: payload.organizationId,
		subaccountId: payload.subaccountId,
		ghlUserId: typeof payload.ghlUserId === "string" ? payload.ghlUserId : null,
	};
}

/** Sign the OAuth `state` so the callback can trust which agency/subaccount it's for. */
export function signOAuthState(state: OAuthState): string {
	return sign(
		{ organizationId: state.organizationId, subaccountId: state.subaccountId },
		OAUTH_STATE_ISSUER,
		15 * 60,
	);
}

export function verifyOAuthState(token: string): OAuthState | null {
	const payload = verify(token, OAUTH_STATE_ISSUER);
	if (!payload || typeof payload.organizationId !== "string") {
		return null;
	}
	return {
		organizationId: payload.organizationId,
		subaccountId: typeof payload.subaccountId === "string" ? payload.subaccountId : null,
	};
}

function readCookie(cookieHeader: string | null, name: string): string | null {
	if (!cookieHeader) {
		return null;
	}
	for (const part of cookieHeader.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) {
			return decodeURIComponent(rest.join("="));
		}
	}
	return null;
}
