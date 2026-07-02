import type { GHLTokenResponse } from "./types";

const GHL_AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

/**
 * OAuth scopes requested from GoHighLevel. Includes contacts/locations scopes
 * plus the conversation/message scopes required for the SMS bridge.
 * NOTE: must match the scopes checked in the marketplace app settings — a scope
 * requested here but missing on the app makes GHL's OAuth silently skip the
 * location chooser and dump the user on the dashboard. users.readonly (for
 * contact-owner mapping) will be re-added in lockstep with the app settings.
 */
const GHL_SCOPES =
	"contacts.readonly contacts.write locations.readonly conversations.readonly conversations.write conversations/message.readonly conversations/message.write";

export function getGhlAuthUrl(state?: string): string {
	const clientId = process.env.GOHIGHLEVEL_CLIENT_ID;
	const redirectUri = process.env.GOHIGHLEVEL_REDIRECT_URI;

	if (!clientId || !redirectUri) {
		throw new Error("GOHIGHLEVEL_CLIENT_ID and GOHIGHLEVEL_REDIRECT_URI are required");
	}

	const params = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirectUri,
		scope: GHL_SCOPES,
		...(state ? { state } : {}),
	});

	return `${GHL_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeGhlCode(code: string): Promise<GHLTokenResponse> {
	const clientId = process.env.GOHIGHLEVEL_CLIENT_ID;
	const clientSecret = process.env.GOHIGHLEVEL_CLIENT_SECRET;
	const redirectUri = process.env.GOHIGHLEVEL_REDIRECT_URI;

	if (!clientId || !clientSecret || !redirectUri) {
		throw new Error("GoHighLevel OAuth credentials are not configured");
	}

	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: redirectUri,
		user_type: "Location",
	});

	const response = await fetch(GHL_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`GHL token exchange failed: ${response.status} ${text}`);
	}

	return response.json() as Promise<GHLTokenResponse>;
}

export async function refreshGhlToken(refreshToken: string): Promise<GHLTokenResponse> {
	const clientId = process.env.GOHIGHLEVEL_CLIENT_ID;
	const clientSecret = process.env.GOHIGHLEVEL_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error("GoHighLevel OAuth credentials are not configured");
	}

	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: clientId,
		client_secret: clientSecret,
		user_type: "Location",
	});

	const response = await fetch(GHL_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`GHL token refresh failed: ${response.status} ${text}`);
	}

	return response.json() as Promise<GHLTokenResponse>;
}
