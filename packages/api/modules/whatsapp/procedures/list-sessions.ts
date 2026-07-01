import { listWhatsAppSessions } from "@repo/database";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const listSessions = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/sessions",
		tags: ["WhatsApp"],
		summary: "List WhatsApp sessions",
		description: "List all WhatsApp sessions for the caller's active organization",
	})
	.handler(async ({ context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		return listWhatsAppSessions(organizationId);
	});
