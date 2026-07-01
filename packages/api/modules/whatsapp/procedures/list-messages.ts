import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, listWhatsAppMessagesBySession } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

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
		}),
	)
	.handler(async ({ input: { id, limit }, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const row = await getWhatsAppSession(organizationId, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		return listWhatsAppMessagesBySession(organizationId, row.id, limit);
	});
