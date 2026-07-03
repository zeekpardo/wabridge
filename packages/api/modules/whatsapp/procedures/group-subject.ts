import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

export const setGroupSubject = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/subject",
		tags: ["WhatsApp"],
		summary: "Set a group's subject (name)",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			subject: z.string().min(1),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.setGroupSubject(sender.openwaSessionId, input.groupId, input.subject);
		} catch (error) {
			mapGroupError(error, "whatsapp.setGroupSubject");
		}

		return { ok: true };
	});
