import { ORPCError } from "@orpc/server";
import { deleteWhatsAppSession, getWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const deleteSession = protectedProcedure
	.route({
		method: "DELETE",
		path: "/whatsapp/sessions/{id}",
		tags: ["WhatsApp"],
		summary: "Delete a WhatsApp session",
		description: "Deletes the session in OpenWA and removes the stored row",
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

		try {
			await openwa.deleteSession(row.openwaSessionId);
		} catch (error) {
			// Log but still remove our row so the org isn't stuck with a dangling session.
			logger.error(error, { ctx: "whatsapp.deleteSession", id });
		}

		await deleteWhatsAppSession(organizationId, id);

		return { success: true };
	});
