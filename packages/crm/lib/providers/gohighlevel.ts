import { type GHLContact, type GoHighLevelClient, ghlContactDisplayName } from "@repo/integrations";
import { logger } from "@repo/logs";

import type { CrmProvider } from "../provider";
import type {
	CrmContact,
	CrmFieldGroup,
	CrmMessageStatus,
	CrmOwner,
	CrmRecordedMessage,
} from "../types";

/**
 * The GoHighLevel connection fields the provider needs. Structurally matches the
 * persisted GoHighLevelConnection — the provider only reads its location and the
 * provider ids used when recording messages.
 */
export interface GoHighLevelConnectionRef {
	locationId: string;
	smsProviderId: string | null;
	conversationProviderId: string | null;
}

/** Map a GHL contact onto the neutral CrmContact shape. */
function toCrmContact(contact: GHLContact): CrmContact {
	return {
		id: contact.id,
		name: ghlContactDisplayName(contact),
		firstName: contact.firstName ?? null,
		lastName: contact.lastName ?? null,
		email: contact.email ?? null,
		phone: contact.phone ?? null,
		tags: contact.tags ?? [],
		assignedTo: contact.assignedTo ?? null,
	};
}

/**
 * GoHighLevel implementation of {@link CrmProvider}. Thin delegation to a
 * {@link GoHighLevelClient} plus the encapsulated connection — each method is
 * 1:1 with the CRM API call the app makes today, keeping runtime behavior
 * identical while callers speak only the neutral interface.
 */
export class GoHighLevelProvider implements CrmProvider {
	readonly type = "gohighlevel";

	private readonly client: GoHighLevelClient;
	private readonly connection: GoHighLevelConnectionRef;

	constructor(client: GoHighLevelClient, connection: GoHighLevelConnectionRef) {
		this.client = client;
		this.connection = connection;
	}

	// ─── Sync (messaging mirror) ────────────────────────────────────────────────

	async upsertContactByPhone(input: {
		phone: string;
		name?: string | null;
	}): Promise<{ id: string; name: string | null }> {
		const contact = await this.client.upsertContact({
			phone: input.phone,
			locationId: this.connection.locationId,
			...(input.name ? { name: input.name } : {}),
			source: "WABridge",
		});
		return { id: contact.id, name: ghlContactDisplayName(contact) };
	}

	/**
	 * Mirror a WhatsApp group as a GHL contact (Wazzap-style): the placeholder
	 * phone is the reverse-routing key GHL holds the contact by, and the group jid
	 * goes in `email` so the record is recognizable as a group in the GHL UI.
	 * Best-effort mapping, consistent with {@link upsertContactByPhone}.
	 */
	async upsertGroupContact(input: {
		groupJid: string;
		placeholderPhone: string;
		name?: string | null;
	}): Promise<{ id: string; name: string | null }> {
		const contact = await this.client.upsertContact({
			phone: input.placeholderPhone,
			locationId: this.connection.locationId,
			name: input.name ?? "WhatsApp Group",
			email: input.groupJid,
			source: "WABridge",
		});
		return { id: contact.id, name: ghlContactDisplayName(contact) };
	}

	async getOrCreateConversation(contactId: string): Promise<{ id: string }> {
		const conversation = await this.client.getOrCreateConversation({
			locationId: this.connection.locationId,
			contactId,
		});
		return { id: conversation.id };
	}

	async recordInbound(input: {
		conversationId: string;
		body: string;
		attachments?: string[];
		type: string;
		date: string;
	}): Promise<CrmRecordedMessage> {
		const res = await this.client.postInboundMessage({
			// SMS-replace (Option B): no conversationProviderId.
			conversationId: input.conversationId,
			message: input.body,
			attachments: input.attachments,
			type: "SMS",
			date: input.date,
		});
		return { crmMessageId: res.messageId ?? res.message?.id ?? null };
	}

	async recordOutbound(input: {
		conversationId: string;
		body: string;
		attachments?: string[];
		type: string;
		date: string;
	}): Promise<CrmRecordedMessage> {
		const res = await this.client.postOutboundMessageRecord({
			conversationId: input.conversationId,
			message: input.body,
			attachments: input.attachments,
			type: "SMS",
			date: input.date,
			// Unlike the inbound API, GHL's outbound-record endpoint REQUIRES the
			// provider id even for the SMS-replace provider
			// (CONVERSATIONS_MSG_PROVIDER_ID_REQUIRED).
			conversationProviderId:
				this.connection.smsProviderId ?? this.connection.conversationProviderId ?? undefined,
		});
		return { crmMessageId: res.messageId ?? res.message?.id ?? null };
	}

	async updateMessageStatus(input: {
		crmMessageId: string;
		status: CrmMessageStatus;
	}): Promise<void> {
		await this.client.updateMessageStatus({
			messageId: input.crmMessageId,
			status: input.status,
		});
	}

	/**
	 * Mark the contact's primary WhatsApp number on its GHL contact via a
	 * `wa:<digits>` tag. There is exactly one such tag per contact — the digits of
	 * the sticky primary number — so any stale `wa:` tag is stripped before the new
	 * one is added (a number change replaces, not accumulates).
	 *
	 * Read-modify-write over the contact's tag list, idempotent: when the tag set
	 * already matches, nothing is written. Best-effort — a missing contact, a GHL
	 * hiccup, or a bad phone logs and returns; it must never break the caller.
	 */
	async setPrimaryNumberTag(contactId: string, phone: string): Promise<void> {
		try {
			const digits = phone.replace(/\D/g, "");
			if (!digits) {
				return;
			}
			const tag = `wa:${digits}`;

			const contact = await this.client.getContact(contactId);
			const existing = Array.isArray(contact.tags)
				? contact.tags.filter((value): value is string => typeof value === "string")
				: [];

			const kept = existing.filter((value) => !/^wa:/i.test(value));
			const next = [...kept, tag];

			// Already correct (single wa: tag, matching digits) — no write.
			const strippedAnything = kept.length !== existing.length;
			const alreadyHadTag = existing.some((value) => value === tag);
			if (!strippedAnything && alreadyHadTag) {
				return;
			}

			await this.client.updateContact(contactId, { tags: next });
		} catch (error) {
			logger.warn("GHL primary number tag sync failed", {
				ctx: "ghl.syncPrimaryNumberTag",
				ghlContactId: contactId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// ─── Directory (contact panel) ──────────────────────────────────────────────

	async getContact(contactId: string): Promise<CrmContact | null> {
		const contact = await this.client.getContact(contactId);
		return contact ? toCrmContact(contact) : null;
	}

	async listOwners(): Promise<CrmOwner[]> {
		const users = await this.client.getUsers();
		return users.map((ghlUser) => ({
			id: ghlUser.id,
			name:
				[ghlUser.firstName, ghlUser.lastName].filter(Boolean).join(" ") ||
				ghlUser.name ||
				ghlUser.email ||
				"GHL user",
			email: ghlUser.email ?? "",
			phone: ghlUser.phone?.trim() || null,
			image: null,
			role: ghlUser.roles?.role ?? "staff",
		}));
	}

	async setContactOwner(contactId: string, ownerId: string | null): Promise<void> {
		await this.client.updateContact(contactId, { assignedTo: ownerId });
	}

	async setContactTags(contactId: string, tags: string[]): Promise<void> {
		await this.client.updateContact(contactId, { tags });
	}

	async addContactTags(contactId: string, tags: string[]): Promise<void> {
		await this.client.addTags(contactId, tags);
	}

	async setContactFields(
		contactId: string,
		fields: { firstName?: string; lastName?: string; email?: string },
	): Promise<void> {
		await this.client.updateContact(contactId, {
			...(fields.firstName !== undefined ? { firstName: fields.firstName } : {}),
			...(fields.lastName !== undefined ? { lastName: fields.lastName } : {}),
			...(fields.email !== undefined ? { email: fields.email } : {}),
		});
	}

	async listTags(): Promise<string[]> {
		const tags = await this.client.getTags();
		return tags.map((tag) => tag.name).sort((a, b) => a.localeCompare(b));
	}

	async customFieldGroups(contactId: string): Promise<CrmFieldGroup[]> {
		const [definitions, folders, contact] = await Promise.all([
			this.client.getCustomFields(),
			this.client.getCustomFieldFolders(),
			this.client.getContact(contactId),
		]);

		// The contact's set values, keyed by field id.
		const valueById = new Map<string, string>();
		for (const field of contact.customFields ?? []) {
			const value = Array.isArray(field.value) ? field.value.join(", ") : field.value;
			if (value != null && value !== "") {
				valueById.set(field.id, String(value));
			}
		}

		// Fields keyed by their folder, ordered by position within each.
		const byFolder = new Map<string, typeof definitions>();
		for (const def of definitions) {
			if (def.documentType && def.documentType !== "field") {
				continue;
			}
			const key = def.parentId ?? "__ungrouped__";
			const list = byFolder.get(key) ?? [];
			list.push(def);
			byFolder.set(key, list);
		}

		const groups: CrmFieldGroup[] = [];
		for (const folder of folders) {
			const defs = (byFolder.get(folder.id) ?? [])
				.slice()
				.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
			if (defs.length === 0) {
				continue;
			}
			groups.push({
				id: folder.id,
				name: folder.name,
				fields: defs.map((def) => ({
					id: def.id,
					name: def.name,
					value: valueById.get(def.id) ?? null,
				})),
			});
		}

		return groups;
	}

	contactUrl(contactId: string): string | null {
		return `https://app.gohighlevel.com/v2/location/${this.connection.locationId}/contacts/detail/${contactId}`;
	}

	async getUsers(): Promise<
		Array<{
			id: string;
			email?: string;
			firstName?: string;
			lastName?: string;
			name?: string;
			roles?: { role?: string };
			phone?: string;
		}>
	> {
		return this.client.getUsers();
	}
}
