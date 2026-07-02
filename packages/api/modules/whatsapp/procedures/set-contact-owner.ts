import {
	getConversation,
	getGhlConnection,
	listOrganizationMembers,
	setConversationOwner,
} from "@repo/database";
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
			"GHL-connected subaccounts assign in GHL terms: ownerId is a GHL user id, written to the contact's assignedTo, with the email-matched agency member cached locally. Standalone subaccounts assign an agency member locally.",
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

		const ghl = await getGhlConnection(subaccount.id);

		// Standalone: the owner is an agency member, stored locally.
		if (!ghl) {
			await setConversationOwner({
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				chatId: input.chatId,
				ownerId: input.ownerId,
			});
			return { ok: true };
		}

		// Connected: ownerId is a GHL user id (the dropdown lists location staff).
		const conversation = await getConversation(subaccount.id, input.chatId);
		if (!conversation?.ghlContactId) {
			logger.warn("Owner set on a thread not linked to a GHL contact; skipped", {
				ctx: "whatsapp.contactOwner",
				chatId: input.chatId,
			});
			return { ok: true };
		}

		const client = await createGoHighLevelClient(subaccount.id);
		if (!client) {
			return { ok: true };
		}

		await client.updateContact(conversation.ghlContactId, { assignedTo: input.ownerId });

		// Cache the email-matched agency member locally (null when the GHL user
		// isn't a member) so app-internal surfaces have a member to point at.
		let memberOwnerId: string | null = null;
		if (input.ownerId) {
			try {
				const [users, members] = await Promise.all([
					client.getUsers(),
					listOrganizationMembers(subaccount.organizationId),
				]);
				const email = users.find((u) => u.id === input.ownerId)?.email?.toLowerCase();
				memberOwnerId = email
					? (members.find((member) => member.user.email.toLowerCase() === email)?.userId ?? null)
					: null;
			} catch (error) {
				logger.warn("GHL owner member-cache mapping failed", {
					ctx: "whatsapp.contactOwner",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		await setConversationOwner({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			ownerId: memberOwnerId,
		});

		return { ok: true };
	});
