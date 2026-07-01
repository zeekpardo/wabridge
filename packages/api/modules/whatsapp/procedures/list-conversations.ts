import { listConversations } from "@repo/database";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const listConversationsProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/conversations",
		tags: ["WhatsApp"],
		summary: "List conversations",
		description: "Inbox: one thread per contact for the active organization, newest first.",
	})
	.handler(async ({ context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		return listConversations(organizationId);
	});
