import { setConversationOwner } from "@repo/database";
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
			"Sets the owning org member for a contact. Persisted locally now; synced to GoHighLevel once connected.",
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

		await setConversationOwner({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			ownerId: input.ownerId,
		});
		return { ok: true };
	});
