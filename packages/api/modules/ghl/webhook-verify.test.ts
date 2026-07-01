import { generateKeyPairSync, sign as edSign } from "node:crypto";

import { verifyGhlWebhookSignature } from "@repo/integrations/webhook-verify";
import { describe, expect, it } from "vitest";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function signBody(body: string): string {
	return edSign(null, Buffer.from(body, "utf8"), privateKey).toString("base64");
}

describe("verifyGhlWebhookSignature (Ed25519)", () => {
	const body = JSON.stringify({ locationId: "loc_1", phone: "+15551234567", message: "hi" });

	it("accepts a valid signature", () => {
		expect(verifyGhlWebhookSignature(body, signBody(body), publicPem)).toBe(true);
	});

	it("accepts a bare-base64 (unarmored) public key", () => {
		const bareBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
		expect(verifyGhlWebhookSignature(body, signBody(body), bareBase64)).toBe(true);
	});

	it("rejects a tampered body", () => {
		const sig = signBody(body);
		expect(verifyGhlWebhookSignature(`${body} `, sig, publicPem)).toBe(false);
	});

	it("rejects a missing signature", () => {
		expect(verifyGhlWebhookSignature(body, null, publicPem)).toBe(false);
	});

	it("rejects a signature from a different key", () => {
		const other = generateKeyPairSync("ed25519");
		const sig = edSign(null, Buffer.from(body), other.privateKey).toString("base64");
		expect(verifyGhlWebhookSignature(body, sig, publicPem)).toBe(false);
	});
});
