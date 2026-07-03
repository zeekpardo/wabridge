import { createOpenWaClient, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

/**
 * Normalize a participant to a `<digits>@c.us` jid. Accepts a raw jid (passed
 * through) or a phone number (normalized via the same helper `send` uses).
 */
function toParticipantJid(value: string): string {
	return value.endsWith("@c.us") ? value : toChatId(value);
}

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

		const participants = input.participants.map(toParticipantJid);

		const openwa = createOpenWaClient();
		try {
			return await openwa.createGroup(sender.openwaSessionId, {
				name: input.name,
				participants,
			});
		} catch (error) {
			mapGroupError(error, "whatsapp.createGroup");
		}
	});
