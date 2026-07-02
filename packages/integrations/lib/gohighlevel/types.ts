export interface GHLAttributionSource {
	sessionSource?: string | null;
	medium?: string | null;
	url?: string | null;
	campaign?: string | null;
	utmSource?: string | null;
	utmMedium?: string | null;
	utmCampaign?: string | null;
}

export interface GHLContact {
	id: string;
	firstName?: string;
	lastName?: string;
	name?: string;
	email?: string;
	phone?: string;
	locationId: string;
	tags?: string[];
	customFields?: GHLCustomFieldValue[];
	dateOfBirth?: string | null;
	gender?: string | null;
	source?: string | null;
	attributionSource?: GHLAttributionSource | null;
	/** GHL user id of the assigned owner, when set. */
	assignedTo?: string | null;
	createdBy?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

/** A GHL location user (Settings → My Staff). Requires the users.readonly scope. */
export interface GHLUser {
	id: string;
	name?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	roles?: { type?: string; role?: string; locationIds?: string[] };
}

/**
 * A GHL contact's display name. Per the GHL API, list/upsert responses may
 * populate `firstName`/`lastName` without `name` (or vice versa) — never rely
 * on either alone. Returns null when the contact has no usable name (e.g.
 * phone-only contacts), so callers can keep their own fallback.
 */
export function ghlContactDisplayName(contact: GHLContact): string | null {
	const joined = [contact.firstName, contact.lastName]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(" ");
	const name = joined || contact.name?.trim() || "";
	return name.length > 0 ? name : null;
}

export interface GHLCustomFieldValue {
	id: string;
	value: string | string[];
}

export interface GHLCustomFieldDefinition {
	id: string;
	name: string;
	fieldKey: string;
	dataType: string;
	locationId: string;
	model: string;
}

export interface GHLContactCreateInput {
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	locationId: string;
	tags?: string[];
	customFields?: GHLCustomFieldValue[];
	source?: string;
}

export interface GHLContactUpdateInput {
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	tags?: string[];
	customFields?: GHLCustomFieldValue[];
	/** GHL user id to assign as the contact's owner (null clears the assignment). */
	assignedTo?: string | null;
}

export interface GHLApiResponse<T> {
	contact?: T;
	contacts?: T[];
	meta?: {
		total?: number;
		count?: number;
		currentPage?: number;
		nextPage?: number | null;
		prevPage?: number | null;
		startAfterId?: string | null;
		startAfter?: number | null;
	};
}

export interface GHLTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	locationId?: string;
	companyId?: string;
	userId?: string;
}

// ─── Location Types ─────────────────────────────────────────────────────────

export interface GHLLocation {
	id: string;
	name: string;
	email?: string;
	phone?: string;
	address?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
	logoUrl?: string;
	website?: string;
}

// ─── Conversation / Message Types ───────────────────────────────────────────

export interface GHLConversation {
	id: string;
	locationId: string;
	contactId: string;
	lastMessageBody?: string;
	lastMessageType?: string;
	type?: string;
	unreadCount?: number;
	dateAdded?: string;
	dateUpdated?: string;
}

/** Message channel type. GHL uses uppercase discriminators. */
export type GHLMessageType = "SMS" | "Email" | "WhatsApp" | "GMB" | "IG" | "FB" | "Custom";

/** Direction of a message relative to the location/business. */
export type GHLMessageDirection = "inbound" | "outbound";

/** Delivery status reported back to GHL for an outbound provider message. */
export type GHLMessageStatus = "delivered" | "read" | "failed" | "pending";

export interface GHLInboundMessageInput {
	/**
	 * Custom conversation provider id. Required for a custom channel (Option A);
	 * omit for the SMS-replace provider (Option B), which posts against the
	 * native SMS channel.
	 */
	conversationProviderId?: string;
	/** The GHL conversation to append to (one per contact; see getOrCreateConversation). */
	conversationId: string;
	message: string;
	/** Public attachment URLs. */
	attachments?: string[];
	type: GHLMessageType;
	/** Original message time (ISO 8601); defaults to now on GHL's side. */
	date?: string;
}

export interface GHLOutboundMessageInput {
	/** Custom conversation provider id (omit for the SMS-replace provider). */
	conversationProviderId?: string;
	/** The GHL conversation to append to (one per contact; see getOrCreateConversation). */
	conversationId: string;
	message: string;
	/** Public attachment URLs. */
	attachments?: string[];
	type: GHLMessageType;
	/** Original message time (ISO 8601); defaults to now on GHL's side. */
	date?: string;
}

export interface GHLMessageResponse {
	/** GHL message id created for the inbound/outbound record. */
	messageId?: string;
	conversationId?: string;
	message?: {
		id?: string;
		conversationId?: string;
	};
}

export interface GHLUpdateMessageStatusInput {
	messageId: string;
	status: GHLMessageStatus;
	/** Optional error detail when status is "failed". */
	error?: string;
}
