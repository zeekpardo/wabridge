// Neutral CRM domain types. These deliberately carry no vendor (GHL) naming:
// they describe what the app needs from *any* CRM, so a new provider can be
// added without touching callers. Each provider implementation maps its own
// wire types to/from these.

/** A contact as the app sees it, independent of the backing CRM. */
export interface CrmContact {
	id: string;
	name: string | null;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	phone?: string | null;
	tags: string[];
	/** The CRM's assigned owner id for this contact, when set. */
	assignedTo?: string | null;
}

/** A staff member / user the app can assign a contact to. */
export interface CrmOwner {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	image: string | null;
	role: string;
}

/** A named group of custom fields (a folder in CRM terms) with the contact's values. */
export interface CrmFieldGroup {
	id: string;
	name: string;
	fields: { id: string; name: string; value: string | null }[];
}

/** How a messaging thread maps onto a CRM record. */
export interface CrmThreadRef {
	kind: "contact" | "group";
	phone?: string | null;
	groupJid?: string | null;
	displayName?: string | null;
}

/** Delivery status the app reports back for an outbound message. */
export type CrmMessageStatus = "delivered" | "read" | "failed";

/** The result of recording a message in the CRM's conversation timeline. */
export interface CrmRecordedMessage {
	crmMessageId: string | null;
}
