import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * Verify a GoHighLevel Delivery-URL / provider webhook signature.
 *
 * Provider Outbound (and platform) webhooks are signed with Ed25519 over the
 * raw request body and delivered in the `X-GHL-Signature` header (base64). This
 * is distinct from the legacy RSA `X-WH-Signature` used on some older OAuth-app
 * webhooks — use this for the conversation-provider Delivery URL.
 *
 * The public key comes from GHL's Provider-Outbound security doc; store it in
 * `GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY` (PEM, or bare base64 SPKI which we wrap).
 */
export function verifyGhlWebhookSignature(
	rawBody: string,
	signatureBase64: string | null | undefined,
	publicKey?: string,
): boolean {
	const key = publicKey ?? process.env.GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY;
	if (!key || !signatureBase64) {
		return false;
	}

	try {
		const keyObject = createPublicKey(toPem(key));
		return cryptoVerify(
			null,
			Buffer.from(rawBody, "utf8"),
			keyObject,
			Buffer.from(signatureBase64, "base64"),
		);
	} catch {
		return false;
	}
}

/** Accept a PEM key as-is, or wrap a bare base64 SPKI body in PEM armor. */
function toPem(key: string): string {
	const trimmed = key.trim();
	if (trimmed.includes("BEGIN PUBLIC KEY")) {
		return trimmed;
	}
	const body =
		trimmed
			.replace(/\s+/g, "")
			.match(/.{1,64}/g)
			?.join("\n") ?? trimmed;
	return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}
