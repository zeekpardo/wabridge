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

/**
 * OpenSSL EVP_BytesToKey (MD5) key derivation — matches CryptoJS's default
 * passphrase mode, which is what GoHighLevel uses to encrypt SSO payloads.
 */
function evpBytesToKey(
	password: Buffer,
	salt: Buffer,
	keyLen: number,
	ivLen: number,
): { key: Buffer; iv: Buffer } {
	const crypto = require("node:crypto") as typeof import("node:crypto");
	const derived: Buffer[] = [];
	let block = Buffer.alloc(0);
	let total = 0;
	while (total < keyLen + ivLen) {
		block = crypto
			.createHash("md5")
			.update(Buffer.concat([block, password, salt]))
			.digest();
		derived.push(block);
		total += block.length;
	}
	const full = Buffer.concat(derived);
	return { key: full.subarray(0, keyLen), iv: full.subarray(keyLen, keyLen + ivLen) };
}

/**
 * Decrypt a GoHighLevel SSO payload. The GHL Custom Page iframe posts an
 * AES-encrypted (CryptoJS default: OpenSSL "Salted__" + AES-256-CBC) blob; we
 * decrypt it with the app's SSO key to recover the user/location context.
 */
export function decryptGhlSsoPayload<T = Record<string, unknown>>(
	encryptedBase64: string,
	ssoKey: string,
): T {
	const crypto = require("node:crypto") as typeof import("node:crypto");
	const data = Buffer.from(encryptedBase64, "base64");
	// CryptoJS/OpenSSL salted format: "Salted__"(8) + salt(8) + ciphertext.
	if (data.subarray(0, 8).toString("utf8") !== "Salted__") {
		throw new Error("Unexpected GHL SSO payload format");
	}
	const salt = data.subarray(8, 16);
	const ciphertext = data.subarray(16);
	const { key, iv } = evpBytesToKey(Buffer.from(ssoKey, "utf8"), salt, 32, 16);
	const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return JSON.parse(decrypted.toString("utf8")) as T;
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
