import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ApiRouterClient } from "@repo/api/orpc/router";

/**
 * localStorage key holding the GHL embedded-session token. Set by the SSO
 * handshake (EmbeddedSsoBootstrap); read here so the embedded iframe can
 * authenticate via the `x-embedded-token` header instead of a cookie — third-
 * party cookies are blocked in the GHL iframe, but headers always go through.
 */
export const EMBEDDED_TOKEN_STORAGE_KEY = "wabridge_embedded_token";

/**
 * localStorage key holding the subaccount id the stored embedded token is for.
 * The token is per-origin, but a GHL agency opens many locations from the same
 * origin — so the bootstrap re-runs SSO and compares against this to detect that
 * the current Custom Page is a DIFFERENT location than the token was minted for
 * (which would otherwise show the first location's data on the second).
 */
export const EMBEDDED_SUBACCOUNT_STORAGE_KEY = "wabridge_embedded_subaccount";

/** Detect an Unauthorized (401) error across ORPCError / thrown-Error shapes. */
function isUnauthorized(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const e = error as { status?: number; code?: string; message?: string };
	return e.status === 401 || e.code === "UNAUTHORIZED" || /unauthorized/i.test(e.message ?? "");
}

const link = new RPCLink({
	url: () => {
		if (typeof window === "undefined") {
			throw new Error("RPCLink is not allowed on the server side.");
		}
		return `${window.location.origin}/api/rpc`;
	},
	headers: async () => {
		if (typeof window === "undefined") {
			return {};
		}
		const token = window.localStorage.getItem(EMBEDDED_TOKEN_STORAGE_KEY);
		return token ? { "x-embedded-token": token } : {};
	},
	interceptors: [
		onError((error) => {
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}

			// Self-heal a stale/expired embedded token. The SSO bootstrap trusts a
			// stored token and won't re-run once one exists, so a rejected token would
			// white-screen the GHL iframe forever. On Unauthorized, drop the token and
			// reload — the handshake re-mints it. Guarded on a token being present, so
			// it can fire at most once (after clearing there's nothing to reload for).
			if (typeof window !== "undefined" && isUnauthorized(error)) {
				if (window.localStorage.getItem(EMBEDDED_TOKEN_STORAGE_KEY)) {
					window.localStorage.removeItem(EMBEDDED_TOKEN_STORAGE_KEY);
					window.localStorage.removeItem(EMBEDDED_SUBACCOUNT_STORAGE_KEY);
					window.location.reload();
					return;
				}
			}

			console.error(error);
		}),
	],
});

export const orpcClient: ApiRouterClient = createORPCClient(link);
