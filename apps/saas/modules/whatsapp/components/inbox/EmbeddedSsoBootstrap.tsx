"use client";

import { EMBEDDED_TOKEN_STORAGE_KEY } from "@shared/lib/orpc-client";
import { useEffect } from "react";

/**
 * Establishes the embedded session inside a GoHighLevel Custom Page iframe.
 *
 * GHL doesn't expose the SSO blob directly — the page requests it via
 * postMessage, GHL replies with the encrypted payload, and we hand it to
 * /api/ghl-sso/decrypt which verifies it and sets the SameSite=None embedded
 * cookie. Once set, the inbox's oRPC calls authenticate via that cookie even
 * though the first-party session cookie is blocked in the third-party frame.
 *
 * No-op outside an iframe (first-party / dev), where the normal session works.
 */
export function EmbeddedSsoBootstrap() {
	useEffect(() => {
		if (typeof window === "undefined" || window.parent === window) {
			return;
		}
		// If we already hold an embedded token (survives reloads via localStorage),
		// the oRPC client is already authenticating via header — nothing to do.
		if (window.localStorage.getItem(EMBEDDED_TOKEN_STORAGE_KEY)) {
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
				const data = (await res.json()) as { token?: string };
				if (data.token) {
					// Persist the token so the oRPC client sends it as `x-embedded-token`
					// on every call — the auth path that survives third-party-cookie
					// blocking. Reload so already-mounted queries refetch with the header.
					window.localStorage.setItem(EMBEDDED_TOKEN_STORAGE_KEY, data.token);
					window.location.reload();
				}
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
