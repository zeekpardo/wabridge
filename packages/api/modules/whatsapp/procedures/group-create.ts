import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession, resolveParticipantJids } from "./group-lib";

export const createGroup = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/create",
		tags: ["WhatsApp"],
		summary: "Create a WhatsApp group",
		description:
			"Creates a group from the given number, which becomes the owner. Participants accept phone numbers or @c.us jids.",
	})
	.input(
		z.object({
			sessionId: z.string(),
			name: z.string().min(1),
			participants: z.array(z.string().min(1)).min(1),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		const participants = await resolveParticipantJids(
			openwa,
			sender.openwaSessionId,
			input.participants,
		);
		try {
			const group = await openwa.createGroup(sender.openwaSessionId, {
				name: input.name,
				participants,
			});
			// The gateway's create result already reports who WhatsApp couldn't add directly (privacy) —
			// those are auto-invited by WhatsApp, and we also offer to send the link. No second add call.
			const notAdded = (group.results ?? []).filter((r) => !r.added).map((r) => r.number);
			return { ...group, notAdded };
		} catch (error) {
			mapGroupError(error, "whatsapp.createGroup");
		}
	});
