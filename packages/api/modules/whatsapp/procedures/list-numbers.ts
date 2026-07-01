import { listSendableSessions } from "@repo/database";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const listNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/numbers",
		tags: ["WhatsApp"],
		summary: "List sendable numbers",
		description: "Ready numbers for the active org, ordered by send priority (for the composer).",
	})
	.handler(async ({ context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const sessions = await listSendableSessions(organizationId);
		return sessions.map((row) => ({
			id: row.id,
			label: row.label,
			phone: row.phone,
			priority: row.priority,
		}));
	});
