import { auth } from "@repo/auth";
import {
	createSubaccount,
	getGhlConnectionByLocationId,
	getOrganizationById,
	getSubaccount,
	getSubaccountByLocationId,
	updateSubaccount,
	upsertGhlConnection,
} from "@repo/database";
import { decryptGhlSsoPayload, encrypt, exchangeGhlCode, getGhlAuthUrl } from "@repo/integrations";
import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";

import {
	EMBEDDED_COOKIE,
	mintEmbeddedToken,
	signOAuthState,
	verifyOAuthState,
} from "../../orpc/lib/embedded-session";
import { verifyOrganizationMembership } from "../organizations/lib/membership";

function saasBaseUrl(): string {
	return getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);
}

function redirect(path: string): Response {
	return Response.redirect(`${saasBaseUrl()}${path}`, 302);
}

/**
 * GET /api/ghl/oauth/authorize — start the GoHighLevel install for the caller's
 * active agency (optionally linking a specific subaccount). Signs the agency +
 * subaccount into `state` so the callback can trust them.
 */
export async function ghlAuthorizeHandler(req: Request): Promise<Response> {
	if (!process.env.GOHIGHLEVEL_CLIENT_ID || !process.env.GOHIGHLEVEL_REDIRECT_URI) {
		return new Response("GoHighLevel OAuth is not configured.", { status: 501 });
	}

	const session = await auth.api.getSession({ headers: req.headers });
	const organizationId = session?.session.activeOrganizationId;
	if (!session || !organizationId) {
		return new Response("Unauthorized.", { status: 401 });
	}
	const membership = await verifyOrganizationMembership(organizationId, session.user.id);
	if (!membership) {
		return new Response("Forbidden.", { status: 403 });
	}

	const url = new URL(req.url);
	const subaccountId = url.searchParams.get("subaccountId");

	const state = signOAuthState({ organizationId, subaccountId: subaccountId || null });
	return Response.redirect(getGhlAuthUrl(state), 302);
}

/**
 * GET /api/ghl/oauth/callback — exchange the code for a location token, then
 * link (or create) the subaccount for that GHL location and store its
 * connection. Provisions a `ghl`-sourced subaccount when none was pre-selected.
 */
export async function ghlCallbackHandler(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	const stateToken = url.searchParams.get("state");
	if (!code || !stateToken) {
		return redirect("/?ghl=error");
	}

	const state = verifyOAuthState(stateToken);
	if (!state) {
		return redirect("/?ghl=state_expired");
	}

	try {
		const tokens = await exchangeGhlCode(code);
		const locationId = tokens.locationId;
		if (!locationId) {
			return redirect("/?ghl=no_location");
		}

		// Resolve the target subaccount: a pre-selected one to link, an existing
		// one already mapped to this location, or a freshly provisioned one.
		let subaccountId = state.subaccountId;
		if (subaccountId) {
			const existing = await getSubaccount(state.organizationId, subaccountId);
			if (!existing) {
				return redirect("/?ghl=bad_subaccount");
			}
			await updateSubaccount(state.organizationId, subaccountId, { ghlLocationId: locationId });
		} else {
			const linked = await getSubaccountByLocationId(locationId);
			if (linked && linked.organizationId === state.organizationId) {
				subaccountId = linked.id;
			} else {
				const created = await createSubaccount({
					organizationId: state.organizationId,
					name: `GHL ${locationId}`,
					provisioningSource: "ghl",
					ghlLocationId: locationId,
				});
				subaccountId = created.id;
			}
		}

		await upsertGhlConnection({
			subaccountId,
			locationId,
			companyId: tokens.companyId ?? null,
			userId: tokens.userId ?? null,
			accessToken: encrypt(tokens.access_token),
			refreshToken: encrypt(tokens.refresh_token),
			tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
			conversationProviderId: process.env.GOHIGHLEVEL_CONVERSATION_PROVIDER_ID ?? null,
		});

		const org = await getOrganizationById(state.organizationId);
		const slug = org?.slug ?? "";
		return redirect(`/${slug}/whatsapp/${subaccountId}?ghl=connected`);
	} catch (error) {
		logger.error(error, { ctx: "ghl.oauth.callback" });
		return redirect("/?ghl=error");
	}
}

/**
 * POST /api/ghl-sso/decrypt — the embedded Custom Page posts its encrypted GHL
 * SSO blob; we decrypt it, map the location to a subaccount, and mint an
 * embedded token (SameSite=None cookie) so the third-party iframe can call the
 * API without the first-party session cookie.
 */
export async function ghlSsoDecryptHandler(req: Request): Promise<Response> {
	const ssoKey = process.env.GHL_SSO_KEY;
	if (!ssoKey) {
		return Response.json({ error: "SSO not configured" }, { status: 501 });
	}

	let encrypted: string | undefined;
	try {
		const body = (await req.json()) as { key?: string; encryptedData?: string };
		encrypted = body.key ?? body.encryptedData;
	} catch {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}
	if (!encrypted) {
		return Response.json({ error: "Missing SSO payload" }, { status: 400 });
	}

	let payload: { locationId?: string; userId?: string };
	try {
		payload = decryptGhlSsoPayload(encrypted, ssoKey);
	} catch (error) {
		logger.error(error, { ctx: "ghl.sso.decrypt" });
		return Response.json({ error: "Could not decrypt SSO payload" }, { status: 400 });
	}

	if (!payload.locationId) {
		return Response.json({ error: "No location in SSO payload" }, { status: 400 });
	}

	const subaccount = await getSubaccountByLocationId(payload.locationId);
	if (!subaccount) {
		return Response.json({ error: "Location not linked to a subaccount" }, { status: 404 });
	}
	// Defensive: only mint when a connection actually exists for this location.
	const connection = await getGhlConnectionByLocationId(payload.locationId);

	const token = mintEmbeddedToken({
		organizationId: subaccount.organizationId,
		subaccountId: subaccount.id,
		ghlUserId: payload.userId ?? null,
	});

	const org = await getOrganizationById(subaccount.organizationId);

	const response = Response.json({
		ok: true,
		subaccountId: subaccount.id,
		organizationSlug: org?.slug ?? null,
		hasConnection: Boolean(connection),
	});
	// Third-party iframe: SameSite=None + Secure so the cookie is sent from GHL.
	response.headers.append(
		"Set-Cookie",
		`${EMBEDDED_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 12}`,
	);
	return response;
}
