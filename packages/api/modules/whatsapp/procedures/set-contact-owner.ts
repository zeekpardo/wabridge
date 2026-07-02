import { getConversation, getGhlConnection, setConversationOwner } from "@repo/database";
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

		// Cache the GHL user id as the thread's display owner so the panel and the
		// conversation-list owner filter agree (same identity as the dropdown).
		await setConversationOwner({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			ownerId: input.ownerId,
		});

		return { ok: true };
	});
