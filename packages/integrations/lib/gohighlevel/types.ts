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
	createdBy?: string | null;
	createdAt?: string;
	updatedAt?: string;
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
	/** The conversation provider id registered in the GHL marketplace app. */
	conversationProviderId: string;
	locationId: string;
	contactId: string;
	message: string;
	attachments?: string[];
	direction: "inbound";
	type: GHLMessageType;
}

export interface GHLOutboundMessageInput {
	/** The conversation provider id registered in the GHL marketplace app. */
	conversationProviderId: string;
	locationId: string;
	contactId: string;
	message: string;
	attachments?: string[];
	direction: "outbound";
	type: GHLMessageType;
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
