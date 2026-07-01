import { createHmac, timingSafeEqual } from "node:crypto";

import type { OpenWaWebhookPayload } from "./types";

/**
 * Computes the OpenWA webhook signature: HMAC-SHA256 of the raw request body
 * keyed by the session's webhook secret, encoded as lowercase hex.
 */
export function computeOpenWaSignature(secret: string, rawBody: string): string {
	return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Verifies an inbound OpenWA webhook signature using a timing-safe comparison.
 * Tolerates an optional `sha256=` prefix on the provided signature header.
 */
export function verifyOpenWaSignature(
	secret: string,
	rawBody: string,
	signatureHeader: string | null | undefined,
): boolean {
	if (!signatureHeader) {
		return false;
	}

	const provided = signatureHeader.startsWith("sha256=")
		? signatureHeader.slice("sha256=".length)
		: signatureHeader;

	const expected = computeOpenWaSignature(secret, rawBody);

	const providedBuffer = Buffer.from(provided, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");

	if (providedBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Parses an OpenWA webhook body string into a typed payload.
 */
export function parseOpenWaWebhookPayload<TData = Record<string, unknown>>(
	rawBody: string,
): OpenWaWebhookPayload<TData> {
	return JSON.parse(rawBody) as OpenWaWebhookPayload<TData>;
}
