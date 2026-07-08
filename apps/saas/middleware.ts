import { type NextRequest, NextResponse } from "next/server";

/**
 * Runtime CSP for the GoHighLevel-embedded WhatsApp Custom Page (`/embedded/*`).
 *
 * Why this lives here and not in `next.config` `headers()`: that config is baked at BUILD time,
 * which makes the `frame-ancestors` allow-list impossible to maintain at scale. Every white-label
 * agency runs GHL on its own custom domain (a CNAME to `app.gohighlevel.com`), so the set of parent
 * origins is open-ended and unknown ahead of time — a new agency would otherwise need a code edit +
 * redeploy just to have the embed load. Computing the header here, per request, makes the policy
 * runtime-configurable and lets unlimited agencies embed the page with zero per-agency changes.
 *
 * Why allowing any HTTPS parent is safe: framing is NOT the security boundary for this page — the
 * GHL *signed user context* is (see `EmbeddedSsoBootstrap` -> `/api/ghl-sso/decrypt`). The page
 * renders nothing tenant-specific until it validates a HighLevel-signed token, which an arbitrary
 * framing site cannot forge. So a stray site framing the page sees an inert shell.
 *
 * Lock it down (optional): set `EMBED_FRAME_ANCESTORS` to a space-separated source list to restrict
 * embedding to explicit origins instead of any HTTPS parent, e.g.
 *   EMBED_FRAME_ANCESTORS="'self' https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com https://app.minflow.co https://app.ministryflow.io"
 */
const DEFAULT_EMBED_FRAME_ANCESTORS = "'self' https:";

export function middleware(_request: NextRequest): NextResponse {
	const response = NextResponse.next();
	const frameAncestors = process.env.EMBED_FRAME_ANCESTORS?.trim() || DEFAULT_EMBED_FRAME_ANCESTORS;
	// frame-ancestors is the only directive that governs who may iframe us; we intentionally do NOT
	// send X-Frame-Options (which HighLevel's docs call out as a blocker for Custom Pages).
	response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);
	return response;
}

export const config = {
	// Scope strictly to the embedded Custom Page. Every other route keeps the browser default
	// (deny cross-origin framing) and is unaffected by this middleware.
	matcher: ["/embedded/:path*"],
};
