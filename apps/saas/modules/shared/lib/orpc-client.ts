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

			console.error(error);
		}),
	],
});

export const orpcClient: ApiRouterClient = createORPCClient(link);
