/**
 * `#location|<lat>|<lng>|<note>|<address>` — send a WhatsApp location pin instead
 * of text. Note and address are optional. The whole message body IS the command
 * (matching Wazzap's syntax). Returns null for non-location messages or invalid
 * coordinates.
 */
export interface LocationParse {
	latitude: number;
	longitude: number;
	note?: string;
	address?: string;
}

const LOCATION_RE = /^#location\|([^|]*)\|([^|]*)(?:\|([^|]*))?(?:\|([^|]*))?\s*$/i;

export function parseLocation(text: string): LocationParse | null {
	const match = text.trim().match(LOCATION_RE);
	if (!match) {
		return null;
	}
	const latitude = Number.parseFloat((match[1] ?? "").trim());
	const longitude = Number.parseFloat((match[2] ?? "").trim());
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return null;
	}
	const note = (match[3] ?? "").trim();
	const address = (match[4] ?? "").trim();
	return {
		latitude,
		longitude,
		note: note || undefined,
		address: address || undefined,
	};
}
