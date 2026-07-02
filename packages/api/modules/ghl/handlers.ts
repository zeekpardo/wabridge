import { auth } from "@repo/auth";
import {
	createSubaccount,
	getConversationByGhlContactId,
	getDefaultSession,
	getGhlConnectionByLocationId,
	getOrganizationById,
	getSubaccount,
	getSubaccountByLocationId,
	getWhatsAppSettings,
	setConversationContactName,
	setConversationTags,
	updateSubaccount,
	upsertGhlConnection,
} from "@repo/database";
import {
	createGoHighLevelClient,
	decryptGhlSsoPayload,
	encrypt,
	exchangeGhlCode,
	getGhlAuthUrl,
	ghlContactDisplayName,
	verifyGhlWebhookSignature,
} from "@repo/integrations";
import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { type GlobalSpintax, toChatId } from "@repo/whatsapp";

import {
	EMBEDDED_COOKIE,
	mintEmbeddedToken,
	signOAuthState,
	verifyOAuthState,
} from "../../orpc/lib/embedded-session";
import { createFanOutDeps } from "../messaging/deps";
import { fanOutMessage } from "../messaging/fan-out";
import { verifyOrganizationMembership } from "../organizations/lib/membership";
import { disconnectSubaccountFromGhl } from "./disconnect-subaccount";
import { resolveOutboundCommand } from "./resolve-command";
import { syncSubaccountNameFromGhl } from "./sync-subaccount-name";

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
			// The SMS-replace (Option B) provider id from the marketplace app —
			// bookkeeping only; Option B API calls don't send a provider id.
			smsProviderId: process.env.GOHIGHLEVEL_SMS_PROVIDER_ID ?? null,
		});

		// Adopt the GHL location name (replaces the `GHL <locationId>` placeholder for
		// freshly provisioned accounts; refreshes it for linked ones). Best-effort.
		await syncSubaccountNameFromGhl(subaccountId);

		const org = await getOrganizationById(state.organizationId);
		const slug = org?.slug ?? "";
		return redirect(`/${slug}/whatsapp/${subaccountId}?ghl=connected`);
	} catch (error) {
		logger.error(error, { ctx: "ghl.oauth.callback" });
		return redirect("/?ghl=error");
	}
}

/**
 * POST /api/ghl/provider/outbound — the Conversation Provider Delivery URL.
 * GHL POSTs a ProviderOutboundMessage whenever a user sends "SMS" from the UI,
 * a workflow, or a bulk action (once we're the SMS provider). We verify the
 * Ed25519 signature and route it through the hub, which delivers over WhatsApp.
 */
export async function ghlProviderOutboundHandler(req: Request): Promise<Response> {
	const rawBody = await req.text();

	// Signature verification is required whenever the public key is configured.
	if (process.env.GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY) {
		const valid = verifyGhlWebhookSignature(rawBody, req.headers.get("X-GHL-Signature"));
		if (!valid) {
			return new Response("Invalid signature.", { status: 401 });
		}
	}

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		return new Response("Invalid body.", { status: 400 });
	}

	const locationId = str(payload.locationId);
	const phone = str(payload.phone) ?? str(payload.to);
	const body = str(payload.message) ?? str(payload.body) ?? "";
	const ghlMessageId = str(payload.messageId) ?? str(payload.id);
	const attachments = Array.isArray(payload.attachments)
		? (payload.attachments.filter((a) => typeof a === "string") as string[])
		: undefined;

	if (!locationId || !phone) {
		// Acknowledge malformed events so GHL doesn't hammer retries.
		return new Response("Ignored.", { status: 200 });
	}

	const subaccount = await getSubaccountByLocationId(locationId);
	if (!subaccount) {
		// A Delivery URL post for a location we don't know — typically the GHL
		// connection was removed (or connected to a different location) while the
		// provider is still enabled in that location's SMS settings.
		logger.warn("Provider outbound for unlinked location", {
			ctx: "ghl.provider.outbound",
			locationId,
		});
		return new Response("Location not linked.", { status: 404 });
	}
	const session = await getDefaultSession(subaccount.id);

	// Resolve commands (spintax + delay) against this subaccount's global spintax
	// BEFORE fan-out, so the persisted/mirrored body is the real per-recipient
	// variation — a bulk send POSTs the same raw template for every recipient.
	const settings = await getWhatsAppSettings(subaccount.id);
	const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};
	const resolved = resolveOutboundCommand(body, globals);
	if (resolved.unresolved.length > 0) {
		logger.warn("Provider outbound had undefined spintax", {
			ctx: "ghl.provider.outbound",
			locationId,
			unresolved: resolved.unresolved,
		});
	}

	try {
		const result = await fanOutMessage(
			{
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				sessionId: session?.id ?? "",
				chatId: toChatId(phone),
				direction: "outbound",
				origin: "ghl",
				body: resolved.text,
				sendDelayMs: resolved.delayMs,
				type: "text",
				attachments,
				ghlMessageId: ghlMessageId ?? null,
				timestamp: new Date(),
			},
			createFanOutDeps(),
		);
		// No WhatsApp message id and not a redelivery → the send didn't happen
		// (e.g. no connected number). Tell GHL so the rep sees "failed" instead of
		// an eternally-pending SMS. Success statuses flow later from the WA ack.
		if (!result.deduped && !result.waMessageId && ghlMessageId) {
			await reportGhlSendFailure(subaccount.id, ghlMessageId, "No connected WhatsApp number");
		}
	} catch (error) {
		logger.error(error, { ctx: "ghl.provider.outbound", locationId });
		if (ghlMessageId) {
			await reportGhlSendFailure(subaccount.id, ghlMessageId, "WhatsApp delivery failed");
		}
		// Acknowledge: we reported the failure; a retry would double-send later.
		return new Response("Delivery failed.", { status: 200 });
	}

	return new Response("OK", { status: 200 });
}

/** Best-effort "failed" status back to GHL for an SMS we couldn't deliver. */
async function reportGhlSendFailure(
	subaccountId: string,
	ghlMessageId: string,
	detail: string,
): Promise<void> {
	try {
		const client = await createGoHighLevelClient(subaccountId);
		if (!client) {
			return;
		}
		await client.updateMessageStatus({ messageId: ghlMessageId, status: "failed", error: detail });
	} catch (error) {
		logger.error(error, { ctx: "ghl.provider.outbound.status", ghlMessageId });
	}
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
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

	// GHL's decrypted SSO payload names the sub-account `activeLocation` (not
	// `locationId`); `userId` is the GHL user. Accept `locationId` as a fallback
	// for any host that uses the alternate name.
	let payload: { activeLocation?: string; locationId?: string; userId?: string };
	try {
		payload = decryptGhlSsoPayload(encrypted, ssoKey);
	} catch (error) {
		logger.error(error, { ctx: "ghl.sso.decrypt" });
		return Response.json({ error: "Could not decrypt SSO payload" }, { status: 400 });
	}

	const locationId = payload.activeLocation ?? payload.locationId;
	if (!locationId) {
		return Response.json({ error: "No location in SSO payload" }, { status: 400 });
	}

	const subaccount = await getSubaccountByLocationId(locationId);
	if (!subaccount) {
		return Response.json({ error: "Location not linked to a subaccount" }, { status: 404 });
	}
	// Defensive: only mint when a connection actually exists for this location.
	const connection = await getGhlConnectionByLocationId(locationId);

	const token = mintEmbeddedToken({
		organizationId: subaccount.organizationId,
		subaccountId: subaccount.id,
		ghlUserId: payload.userId ?? null,
	});

	const org = await getOrganizationById(subaccount.organizationId);

	const response = Response.json({
		ok: true,
		// Returned so the client can store it and send it as `x-embedded-token` —
		// the primary auth path, since third-party cookies are blocked in the GHL
		// iframe. The cookie below is a best-effort fallback for hosts that allow it.
		token,
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

// ─── Marketplace app webhooks (GHL → us) ─────────────────────────────────────

/**
 * Short-TTL webhook dedupe: absorbs GHL's burst/retry duplicates without
 * suppressing legitimate follow-up updates to the same contact. In-memory is
 * fine — a missed dedupe just refreshes the same caches twice.
 */
const WEBHOOK_DEDUP_TTL_MS = 30_000;
const recentGhlEvents = new Map<string, number>();

function isDuplicateGhlEvent(type: string, contactId: string, locationId: string): boolean {
	const now = Date.now();
	if (recentGhlEvents.size > 500) {
		for (const [key, expiresAt] of recentGhlEvents) {
			if (expiresAt < now) {
				recentGhlEvents.delete(key);
			}
		}
	}
	const key = `${type}:${contactId}:${locationId}`;
	const expiresAt = recentGhlEvents.get(key);
	if (expiresAt && expiresAt > now) {
		return true;
	}
	recentGhlEvents.set(key, now + WEBHOOK_DEDUP_TTL_MS);
	return false;
}

/**
 * POST /api/webhooks/gohighlevel — the marketplace app's webhook URL. GHL posts
 * contact lifecycle events here; for threads linked to the contact we refresh
 * the local caches (display name, tags) from the live contact, so edits made
 * on the GHL profile appear in the app without waiting for a panel load.
 *
 * All responses are 200 so GHL doesn't retry-storm; unknown locations/contacts
 * are acknowledged quietly. Effects are benign cache refreshes scoped to a
 * known location, read back from GHL's API rather than trusting the payload.
 * TODO(prod): verify X-WH-Signature once the app's webhook public key is wired.
 */
export async function ghlAppWebhookHandler(req: Request): Promise<Response> {
	let payload: Record<string, unknown>;
	try {
		payload = (await req.json()) as Record<string, unknown>;
	} catch {
		return new Response("Invalid body.", { status: 400 });
	}

	const type = str(payload.type);
	const locationId = str(payload.locationId);

	// App lifecycle: the location uninstalled the marketplace app. Tear down its
	// GHL link so the SaaS reflects "disconnected" (tokens dropped, location
	// unlinked, cached ids cleared); local WhatsApp data is kept. Idempotent and
	// recoverable via reconnect. Signature verification: see the TODO above.
	if (type === "UNINSTALL" && locationId) {
		const uninstalled = await getSubaccountByLocationId(locationId);
		if (uninstalled) {
			await disconnectSubaccountFromGhl(uninstalled);
			logger.info("GHL app uninstalled; disconnected subaccount", {
				ctx: "ghl.webhook.uninstall",
				locationId,
				subaccountId: uninstalled.id,
			});
		}
		return new Response("OK", { status: 200 });
	}

	const contactId = str(payload.id) ?? str(payload.contactId);
	if (!type || !locationId || !contactId || !type.startsWith("Contact")) {
		return new Response("Ignored.", { status: 200 });
	}
	if (isDuplicateGhlEvent(type, contactId, locationId)) {
		return new Response("Duplicate.", { status: 200 });
	}

	const subaccount = await getSubaccountByLocationId(locationId);
	if (!subaccount) {
		return new Response("Unknown location.", { status: 200 });
	}
	const conversation = await getConversationByGhlContactId(subaccount.id, contactId);
	if (!conversation) {
		return new Response("No linked thread.", { status: 200 });
	}

	if (type === "ContactDelete") {
		// The GHL contact is gone; a future message re-links (or re-creates) it.
		logger.info("GHL contact deleted; thread keeps local data", {
			ctx: "ghl.webhook",
			chatId: conversation.chatId,
		});
		return new Response("OK", { status: 200 });
	}

	try {
		const client = await createGoHighLevelClient(subaccount.id);
		if (!client) {
			return new Response("OK", { status: 200 });
		}
		const contact = await client.getContact(contactId);
		const name = ghlContactDisplayName(contact);
		if (name && name !== conversation.contactName) {
			await setConversationContactName({
				subaccountId: subaccount.id,
				chatId: conversation.chatId,
				contactName: name,
			});
		}
		if (contact.tags) {
			await setConversationTags({
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				chatId: conversation.chatId,
				tags: contact.tags,
			});
		}
	} catch (error) {
		logger.warn("GHL webhook contact refresh failed", {
			ctx: "ghl.webhook",
			contactId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return new Response("OK", { status: 200 });
}
