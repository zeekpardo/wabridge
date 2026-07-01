import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, listWhatsAppMessagesBySession } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const listMessages = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/sessions/{id}/messages",
		tags: ["WhatsApp"],
		summary: "List session messages",
		description: "Lists stored messages for a session, most recent first",
	})
	.input(
		z.object({
			id: z.string(),
			limit: z.number().int().min(1).max(200).optional(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { id, limit, subaccountId }, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, subaccountId);

		const row = await getWhatsAppSession(subaccount.id, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		return listWhatsAppMessagesBySession(subaccount.id, row.id, limit);
	});
