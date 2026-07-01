import { ORPCError } from "@orpc/server";
import { getWhatsAppSession } from "@repo/database";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

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
		}),
	)
	.handler(async ({ input: { id }, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const row = await getWhatsAppSession(organizationId, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const openwa = createOpenWaClient();

		return openwa.getQr(row.openwaSessionId);
	});
