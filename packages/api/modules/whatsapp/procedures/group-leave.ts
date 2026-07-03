import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

export const leaveGroup = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/leave",
		tags: ["WhatsApp"],
		summary: "Leave a WhatsApp group",
		description: "The given number leaves the group.",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.leaveGroup(sender.openwaSessionId, input.groupId);
		} catch (error) {
			mapGroupError(error, "whatsapp.leaveGroup");
		}

		return { ok: true };
	});
