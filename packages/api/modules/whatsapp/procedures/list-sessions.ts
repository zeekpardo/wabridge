import { listWhatsAppSessions } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const listSessions = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/sessions",
		tags: ["WhatsApp"],
		summary: "List WhatsApp sessions",
		description: "List all WhatsApp sessions for the resolved subaccount",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(
			session.activeOrganizationId,
			user.id,
			input.subaccountId,
		);

		return listWhatsAppSessions(subaccount.id);
	});
