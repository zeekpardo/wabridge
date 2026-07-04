/**
 * `#contact|<name>|<phone>` — send a WhatsApp contact (vCard) instead of text.
 * The whole message body IS the command (matching Wazzap's syntax). Returns null
 * for non-contact messages.
 */
export interface ContactParse {
	name: string;
	/** Digits only (country code included), the way the gateway wants it. */
	number: string;
}

const CONTACT_RE = /^#contact\|([^|]+)\|([^|]+)\s*$/i;

export function parseContact(text: string): ContactParse | null {
	const match = text.trim().match(CONTACT_RE);
	if (!match) {
		return null;
	}
	const name = (match[1] ?? "").trim();
	const number = (match[2] ?? "").replace(/[^\d]/g, "");
	if (!name || !number) {
		return null;
	}
	return { name, number };
}
