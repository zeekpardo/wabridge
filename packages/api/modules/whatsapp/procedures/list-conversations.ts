import { listConversations } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const listConversationsProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/conversations",
		tags: ["WhatsApp"],
		summary: "List conversations",
		description: "Inbox: one thread per contact for the resolved subaccount, newest first.",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(
			session.activeOrganizationId,
			user.id,
			input.subaccountId,
		);

		return listConversations(subaccount.id);
	});
