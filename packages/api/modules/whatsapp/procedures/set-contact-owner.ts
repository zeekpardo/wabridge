import { getConversation, listOrganizationMembers, setConversationOwner } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const setContactOwner = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-owner",
		tags: ["WhatsApp"],
		summary: "Assign or clear a contact's owner",
		description:
			"Sets the owning org member for a contact. Local-first; when the thread is linked to a GHL contact, the assignment also pushes to GHL's assignedTo (member matched to a GHL location user by email).",
	})
	.input(
		z.object({
			chatId: z.string(),
			ownerId: z.string().nullable(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const conversation = await getConversation(subaccount.id, input.chatId);

		await setConversationOwner({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			ownerId: input.ownerId,
		});

		// Push to the linked GHL contact: match the member to a GHL location user
		// by email and set assignedTo. Best-effort — no email match (or a GHL
		// hiccup) keeps the local assignment and logs. Clearing the owner stays
		// local-only: GHL has no documented unassign, and the read-through would
		// re-adopt GHL's assignment anyway.
		if (input.ownerId && conversation?.ghlContactId) {
			try {
				const client = await createGoHighLevelClient(subaccount.id);
				if (client) {
					const members = await listOrganizationMembers(subaccount.organizationId);
					const member = members.find((m) => m.userId === input.ownerId);
					const email = member?.user.email?.toLowerCase();
					const ghlUser = email
						? (await client.getUsers()).find((u) => u.email?.toLowerCase() === email)
						: undefined;
					if (ghlUser) {
						await client.updateContact(conversation.ghlContactId, { assignedTo: ghlUser.id });
					} else {
						logger.warn("No GHL user matches the owner's email; assignedTo not pushed", {
							ctx: "whatsapp.contactOwner",
							ownerId: input.ownerId,
						});
					}
				}
			} catch (error) {
				logger.warn("GHL owner push failed", {
					ctx: "whatsapp.contactOwner",
					ghlContactId: conversation.ghlContactId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { ok: true };
	});
