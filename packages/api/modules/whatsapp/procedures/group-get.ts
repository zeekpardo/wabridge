import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

export const getGroup = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/get",
		tags: ["WhatsApp"],
		summary: "Get a WhatsApp group's info",
		description:
			"Full group info (subject, description, participants, flags) for the given number.",
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
			return await openwa.getGroupInfo(sender.openwaSessionId, input.groupId);
		} catch (error) {
			mapGroupError(error, "whatsapp.getGroup");
		}
	});
