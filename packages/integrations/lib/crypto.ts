/**
 * AES-256-GCM encryption/decryption for storing OAuth tokens.
 * Requires INTEGRATION_ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	const keyHex = process.env.INTEGRATION_ENCRYPTION_KEY;
	if (!keyHex) {
		throw new Error("INTEGRATION_ENCRYPTION_KEY environment variable is required");
	}
	const key = Buffer.from(keyHex, "hex");
	if (key.length !== 32) {
		throw new Error("INTEGRATION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
	}
	return key;
}

export function encrypt(plaintext: string): string {
	const crypto = require("node:crypto") as typeof import("node:crypto");
	const key = getKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	// Format: iv(hex):authTag(hex):ciphertext(hex)
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
	const crypto = require("node:crypto") as typeof import("node:crypto");
	const key = getKey();
	const parts = ciphertext.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted value format");
	}
	const [ivHex, authTagHex, encryptedHex] = parts;
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const encrypted = Buffer.from(encryptedHex, "hex");
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(authTag);
	return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
