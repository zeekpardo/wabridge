import { ORPCError } from "@orpc/server";
import { getWhatsAppSession } from "@repo/database";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const requestPairingCode = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/sessions/{id}/pairing-code",
		tags: ["WhatsApp"],
		summary: "Request a pairing code",
		description: "Requests a WhatsApp pairing code for the session from OpenWA",
	})
	.input(
		z.object({
			id: z.string(),
			phoneNumber: z.string().regex(/^\d+$/, "Phone number must be digits only, without a +"),
		}),
	)
	.handler(async ({ input: { id, phoneNumber }, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const row = await getWhatsAppSession(organizationId, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const openwa = createOpenWaClient();

		return openwa.requestPairingCode(row.openwaSessionId, phoneNumber);
	});
