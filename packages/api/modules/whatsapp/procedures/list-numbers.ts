import { listSendableSessions } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const listNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/numbers",
		tags: ["WhatsApp"],
		summary: "List sendable numbers",
		description:
			"Ready numbers for the resolved subaccount, ordered by send priority (for the composer).",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const sessions = await listSendableSessions(subaccount.id);
		return sessions.map((row) => ({
			id: row.id,
			label: row.label,
			phone: row.phone,
			priority: row.priority,
		}));
	});
