import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

export const setGroupDescription = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/description",
		tags: ["WhatsApp"],
		summary: "Set a group's description",
		description: "Sets (or, with an empty string, clears) the group description.",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			// Empty string is allowed and clears the description.
			description: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.setGroupDescription(sender.openwaSessionId, input.groupId, input.description);
		} catch (error) {
			mapGroupError(error, "whatsapp.setGroupDescription");
		}

		return { ok: true };
	});
