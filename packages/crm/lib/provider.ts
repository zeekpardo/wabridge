import type {
	CrmContact,
	CrmFieldGroup,
	CrmMessageStatus,
	CrmOwner,
	CrmRecordedMessage,
} from "./types";

/**
 * A CRM-agnostic provider. One object implements both concerns:
 *
 *  - **Sync** — mirroring the WhatsApp messaging stream into the CRM
 *    (contacts, conversations, message records, delivery status).
 *  - **Directory** — the read/write surface behind the contact panel
 *    (contact details, owners, tags, custom fields).
 *
 * The provider ENCAPSULATES the CRM connection (location id, provider ids), so
 * callers never thread those through — they hold a resolved provider and call
 * neutral methods on it. GoHighLevel is one implementation; future CRMs add
 * their own without changing any caller.
 */
export interface CrmProvider {
	/** Stable provider discriminator, e.g. "gohighlevel". */
	readonly type: string;

	// ─── Sync (messaging mirror) ────────────────────────────────────────────────

	/** Upsert a contact by phone, returning its id and current display name. */
	upsertContactByPhone(input: { phone: string; name?: string | null }): Promise<{
		id: string;
		name: string | null;
	}>;

	/** Resolve (creating if needed) the contact's conversation thread. */
	getOrCreateConversation(contactId: string): Promise<{ id: string }>;

	/** Record an inbound (WhatsApp → CRM) message in a conversation. */
	recordInbound(input: {
		conversationId: string;
		body: string;
		attachments?: string[];
		type: string;
		date: string;
	}): Promise<CrmRecordedMessage>;

	/** Record an outbound message this provider sent, back into the CRM timeline. */
	recordOutbound(input: {
		conversationId: string;
		body: string;
		attachments?: string[];
		type: string;
		date: string;
	}): Promise<CrmRecordedMessage>;

	/** Update the delivery status of a previously recorded message. */
	updateMessageStatus(input: { crmMessageId: string; status: CrmMessageStatus }): Promise<void>;

	/** Mark the contact's primary WhatsApp number on its CRM record (best-effort). */
	setPrimaryNumberTag(contactId: string, phone: string): Promise<void>;

	// ─── Directory (contact panel) ──────────────────────────────────────────────

	/** The contact as the app sees it, or null when it can't be read. */
	getContact(contactId: string): Promise<CrmContact | null>;

	/** The staff members a contact can be assigned to. */
	listOwners(): Promise<CrmOwner[]>;

	/** Assign (or clear, with null) the contact's owner. */
	setContactOwner(contactId: string, ownerId: string | null): Promise<void>;

	/** Replace the contact's tag set. */
	setContactTags(contactId: string, tags: string[]): Promise<void>;

	/**
	 * Additively apply tags to the contact via the CRM's dedicated tags endpoint
	 * (idempotent, merges rather than replaces). Used for single-tag adds so the
	 * CRM's own tag set isn't clobbered by the app-side snapshot.
	 */
	addContactTags(contactId: string, tags: string[]): Promise<void>;

	/** Edit the contact's basic fields. */
	setContactFields(
		contactId: string,
		fields: { firstName?: string; lastName?: string; email?: string },
	): Promise<void>;

	/** The CRM's tag library (options for the tag picker). */
	listTags(): Promise<string[]>;

	/** The contact's custom fields grouped by folder, ordered like the CRM's layout. */
	customFieldGroups(contactId: string): Promise<CrmFieldGroup[]>;

	/** Deep link into the CRM contact record, or null when not resolvable. */
	contactUrl(contactId: string): string | null;

	/** Raw staff records, for email-matched owner mapping. */
	getUsers(): Promise<
		Array<{
			id: string;
			email?: string;
			firstName?: string;
			lastName?: string;
			name?: string;
			roles?: { role?: string };
			phone?: string;
		}>
	>;
}
