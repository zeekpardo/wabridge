import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { decryptGhlSsoPayload } from "@repo/integrations/crypto";
import { describe, expect, it } from "vitest";

/**
 * Encrypt a payload the way GoHighLevel does (CryptoJS default: OpenSSL
 * "Salted__" + AES-256-CBC, MD5 EVP_BytesToKey) so we can assert our decrypt
 * recovers it.
 */
function ghlEncrypt(payload: unknown, ssoKey: string): string {
	const salt = randomBytes(8);
	const password = Buffer.from(ssoKey, "utf8");
	const derived: Buffer[] = [];
	let block = Buffer.alloc(0);
	while (Buffer.concat(derived).length < 48) {
		block = createHash("md5")
			.update(Buffer.concat([block, password, salt]))
			.digest();
		derived.push(block);
	}
	const full = Buffer.concat(derived);
	const key = full.subarray(0, 32);
	const iv = full.subarray(32, 48);
	const cipher = createCipheriv("aes-256-cbc", key, iv);
	const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
	return Buffer.concat([Buffer.from("Salted__", "utf8"), salt, body]).toString("base64");
}

describe("decryptGhlSsoPayload", () => {
	const key = "my-sso-shared-secret";

	it("decrypts a GHL-style SSO payload (round trip)", () => {
		const payload = { userId: "u123", companyId: "c1", locationId: "loc_abc", role: "admin" };
		const encrypted = ghlEncrypt(payload, key);
		expect(decryptGhlSsoPayload(encrypted, key)).toEqual(payload);
	});

	it("fails with the wrong key", () => {
		const encrypted = ghlEncrypt({ locationId: "loc_abc" }, key);
		expect(() => decryptGhlSsoPayload(encrypted, "wrong-key")).toThrow();
	});

	it("rejects a non-salted blob", () => {
		expect(() => decryptGhlSsoPayload(Buffer.from("nope").toString("base64"), key)).toThrow();
	});
});
