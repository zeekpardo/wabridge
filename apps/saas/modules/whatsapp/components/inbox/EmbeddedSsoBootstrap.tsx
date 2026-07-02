"use client";

import {
	EMBEDDED_SUBACCOUNT_STORAGE_KEY,
	EMBEDDED_TOKEN_STORAGE_KEY,
} from "@shared/lib/orpc-client";
import { useEffect } from "react";

/**
 * Establishes the embedded session inside a GoHighLevel Custom Page iframe.
 *
 * GHL doesn't expose the SSO blob directly — the page requests it via
 * postMessage, GHL replies with the encrypted payload, and we hand it to
 * /api/ghl-sso/decrypt which verifies it and returns a token the oRPC client
 * sends as `x-embedded-token` (third-party cookies are blocked in the frame).
 *
 * We ALWAYS re-run the handshake — never trust a stored token blindly. The token
 * is per-origin, but a GHL agency opens many locations from the same origin, so
 * a token minted for location A would otherwise be reused on location B and show
 * A's data. We compare the decrypt's subaccount id against the one the stored
 * token is for and only swap + reload when the location actually changed (so
 * same-location reloads don't loop).
 *
 * No-op outside an iframe (first-party / dev), where the normal session works.
 */
export function EmbeddedSsoBootstrap() {
	useEffect(() => {
		if (typeof window === "undefined" || window.parent === window) {
			return;
		}

		let done = false;

		async function exchange(encrypted: string) {
			if (done) {
				return;
			}
			done = true;
			try {
				const res = await fetch("/api/ghl-sso/decrypt", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ key: encrypted }),
				});
				if (!res.ok) {
					return;
				}
				const data = (await res.json()) as { token?: string; subaccountId?: string };
				if (!data.token || !data.subaccountId) {
					return;
				}
				// Already holding the token for THIS location — nothing to do (avoids a
				// reload loop, since every decrypt mints a fresh token string).
				if (window.localStorage.getItem(EMBEDDED_SUBACCOUNT_STORAGE_KEY) === data.subaccountId) {
					return;
				}
				// New/changed location: adopt its token and reload so already-mounted
				// queries refetch scoped to the right subaccount.
				window.localStorage.setItem(EMBEDDED_TOKEN_STORAGE_KEY, data.token);
				window.localStorage.setItem(EMBEDDED_SUBACCOUNT_STORAGE_KEY, data.subaccountId);
				window.location.reload();
			} catch {
				// Leave the first-party session path in place.
			}
		}

		function onMessage(event: MessageEvent) {
			const data = event.data;
			if (
				data &&
				typeof data === "object" &&
				data.message === "REQUEST_USER_DATA_RESPONSE" &&
				typeof data.payload === "string"
			) {
				void exchange(data.payload);
			}
		}

		window.addEventListener("message", onMessage);
		// Ask the GHL parent for the encrypted SSO payload.
		window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");

		return () => window.removeEventListener("message", onMessage);
	}, []);

	return null;
}
