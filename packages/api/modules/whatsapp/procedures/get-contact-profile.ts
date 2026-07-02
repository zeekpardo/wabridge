import {
	getConversation,
	getGhlConnection,
	listOrganizationMembers,
	setConversationContactName,
	setConversationOwner,
	setConversationTags,
} from "@repo/database";
import {
	createGoHighLevelClient,
	ghlContactDisplayName,
	type GHLContact,
} from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface ContactField {
	key: string;
	label: string;
	value: string | null;
	/** Whether this field is editable in the panel (prewired; local for now). */
	editable: boolean;
}

export interface ContactOwner {
	id: string;
	name: string;
}

export interface ContactProfile {
	chatId: string;
	name: string;
	phone: string | null;
	avatarUrl: string | null;
	initials: string;
	ownerId: string | null;
	tags: string[];
	fields: ContactField[];
	ghl: {
		/** Whether a GoHighLevel connection exists for this org. */
		connected: boolean;
		/** The linked GHL contact id, once matched. */
		contactId: string | null;
		/** Deep link into the GHL contact record, when resolvable. */
		contactUrl: string | null;
		/**
		 * GHL's assigned user for this contact, when set. `memberId` is the
		 * email-matched agency member (null when the assignee isn't a member —
		 * the panel then shows the assignment instead of "Unassigned").
		 */
		assignee: { name: string | null; email: string | null; memberId: string | null } | null;
	};
}

/** Turn a WhatsApp chat id (…@c.us / …@lid) into a display phone number. */
function phoneFromChatId(chatId: string): string | null {
	const digits = chatId.replace(/@.*/, "").replace(/\D/g, "");
	if (digits.length < 6) {
		return null;
	}
	return `+${digits}`;
}

function initialsFrom(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const getContactProfile = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-profile",
		tags: ["WhatsApp"],
		summary: "Fetch a contact's CRM profile for a chat",
		description:
			"Returns the contact panel data (name, phone, owner, tags, fields) for a WhatsApp thread. Prewired for GoHighLevel: fields/tags are held locally until a GHL connection is present, then synced.",
	})
	.input(z.object({ chatId: z.string(), subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<ContactProfile> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const [conversation, ghl, members] = await Promise.all([
			getConversation(subaccount.id, input.chatId),
			getGhlConnection(subaccount.id),
			listOrganizationMembers(subaccount.organizationId),
		]);

		// Read-through to the live GHL contact when linked — GHL is the source of
		// truth for name/email/phone/tags/owner then. Best-effort: a GHL hiccup
		// falls back to the local snapshot.
		let ghlContact: GHLContact | null = null;
		let client: Awaited<ReturnType<typeof createGoHighLevelClient>> = null;
		if (ghl && conversation?.ghlContactId) {
			try {
				client = await createGoHighLevelClient(subaccount.id);
				ghlContact = client ? await client.getContact(conversation.ghlContactId) : null;
			} catch (error) {
				logger.warn("GHL contact read-through failed", {
					ctx: "whatsapp.contactProfile",
					ghlContactId: conversation.ghlContactId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// GHL assignedTo → app member, matched by email via the location's users
		// (users.readonly). Unmappable assignments fall back to the local owner.
		let ghlOwnerId: string | null = null;
		let ghlAssignee: ContactProfile["ghl"]["assignee"] = null;
		if (client && ghlContact?.assignedTo) {
			try {
				const users = await client.getUsers();
				const assignee = users.find((u) => u.id === ghlContact.assignedTo);
				const email = assignee?.email?.toLowerCase() ?? null;
				ghlOwnerId = email
					? (members.find((member) => member.user.email.toLowerCase() === email)?.userId ?? null)
					: null;
				const assigneeName =
					[assignee?.firstName, assignee?.lastName].filter(Boolean).join(" ") ||
					assignee?.name ||
					null;
				ghlAssignee = { name: assigneeName, email, memberId: ghlOwnerId };
				if (!ghlOwnerId) {
					// Mapped by email — a GHL assignee who isn't an agency member (or a
					// stale user id) can't surface as a selectable owner here.
					logger.info("GHL assignee has no matching agency member", {
						ctx: "whatsapp.contactProfile",
						assignedTo: ghlContact.assignedTo,
						assigneeEmail: email,
					});
				}
			} catch (error) {
				logger.warn("GHL owner mapping failed", {
					ctx: "whatsapp.contactProfile",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		// Custom fields are surfaced separately, grouped by folder — see the
		// getCustomFieldGroups procedure.

		const ghlName = ghlContact ? ghlContactDisplayName(ghlContact) : null;
		const phone = ghlContact?.phone ?? phoneFromChatId(input.chatId);
		const name = ghlName || conversation?.contactName?.trim() || phone || "Unknown contact";

		// Cache the CRM name on the thread so the conversation list (which never
		// hits GHL per row) shows renames made in GHL.
		if (ghlName && ghlName !== conversation?.contactName) {
			await setConversationContactName({
				subaccountId: subaccount.id,
				chatId: input.chatId,
				contactName: ghlName,
			});
		}

		const localTags = Array.isArray(conversation?.tags)
			? (conversation.tags as unknown[]).filter((tag): tag is string => typeof tag === "string")
			: [];
		// GHL's tags win when linked; cache them locally so standalone views and
		// the next panel load agree even if GHL is briefly unreachable.
		const tags = ghlContact?.tags ?? localTags;
		if (
			ghlContact?.tags &&
			JSON.stringify([...ghlContact.tags].sort()) !== JSON.stringify([...localTags].sort())
		) {
			await setConversationTags({
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				chatId: input.chatId,
				tags: ghlContact.tags,
			});
		}

		// Owner: connected subaccounts assign in GHL terms — the dropdown lists
		// GHL staff, so the selected value is the GHL assignee id. Standalone
		// subaccounts use the local member owner. The email-matched member (when
		// one exists) is still cached on the thread for app-internal use.
		const localOwnerId =
			conversation?.ownerId && members.some((member) => member.userId === conversation.ownerId)
				? conversation.ownerId
				: null;
		const ownerId = ghl ? (ghlContact?.assignedTo ?? null) : localOwnerId;
		if (ghlOwnerId && ghlOwnerId !== conversation?.ownerId) {
			await setConversationOwner({
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				chatId: input.chatId,
				ownerId: ghlOwnerId,
			});
		}

		const nameParts = name.split(/\s+/);
		const splitFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : name;
		const splitLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

		const fields: ContactField[] = [
			{
				key: "firstName",
				label: "First name",
				value: ghlContact?.firstName?.trim() || splitFirst || null,
				editable: true,
			},
			{
				key: "lastName",
				label: "Last name",
				value: ghlContact?.lastName?.trim() || splitLast || null,
				editable: true,
			},
			{ key: "phone", label: "Phone", value: phone, editable: false },
			{ key: "email", label: "Email", value: ghlContact?.email?.trim() || null, editable: true },
		];

		const contactUrl =
			ghl && conversation?.ghlContactId
				? `https://app.gohighlevel.com/v2/location/${ghl.locationId}/contacts/detail/${conversation.ghlContactId}`
				: null;

		return {
			chatId: input.chatId,
			name,
			phone,
			avatarUrl: null,
			initials: initialsFrom(name),
			ownerId,
			tags,
			fields,
			ghl: {
				connected: Boolean(ghl),
				contactId: conversation?.ghlContactId ?? null,
				contactUrl,
				assignee: ghlAssignee,
			},
		};
	});
