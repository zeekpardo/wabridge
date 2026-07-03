import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { linkThreadToGhlByPhone } from "../lib/link-ghl-contact";

export const linkContactByPhone = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-link-phone",
		tags: ["WhatsApp"],
		summary: "Manually link a WhatsApp thread to its GoHighLevel contact by phone",
		description:
			"For WhatsApp-privacy (@lid) threads whose LID can't be auto-resolved to a phone: matches (upserts) the GHL contact by the entered phone and caches the link on the thread so the contact panel reads through to the CRM.",
	})
	.input(
		z.object({
			chatId: z.string(),
			phone: z.string().min(6),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const ghlContactId = await linkThreadToGhlByPhone({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			phone: input.phone,
		});
		return { linked: Boolean(ghlContactId), ghlContactId };
	});
