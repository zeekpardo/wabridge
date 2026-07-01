import { ORPCError } from "@orpc/server";
import { getWhatsAppSession } from "@repo/database";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const getQr = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/sessions/{id}/qr",
		tags: ["WhatsApp"],
		summary: "Get session QR code",
		description: "Returns the QR code data URL for the session from OpenWA",
	})
	.input(
		z.object({
			id: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { id, subaccountId }, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, subaccountId);

		const row = await getWhatsAppSession(subaccount.id, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const openwa = createOpenWaClient();

		return openwa.getQr(row.openwaSessionId);
	});
