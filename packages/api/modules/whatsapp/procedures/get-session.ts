import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, updateWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const getSession = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/sessions/{id}",
		tags: ["WhatsApp"],
		summary: "Get a WhatsApp session",
		description: "Returns the stored session with its live status refreshed from OpenWA",
	})
	.input(
		z.object({
			id: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { id, subaccountId }, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session.activeOrganizationId, user.id, subaccountId);

		const row = await getWhatsAppSession(subaccount.id, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const openwa = createOpenWaClient();

		try {
			const live = await openwa.getSession(row.openwaSessionId);

			const updated = await updateWhatsAppSession(subaccount.id, id, {
				status: live.status,
				phone: live.phone ?? row.phone,
				jid: live.jid ?? row.jid,
			});

			return updated ?? row;
		} catch (error) {
			// If OpenWA is unreachable, fall back to the stored row rather than failing.
			logger.error(error, { ctx: "whatsapp.getSession", id });
			return row;
		}
	});
