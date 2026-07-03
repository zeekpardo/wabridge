import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

const inviteInput = z.object({
	sessionId: z.string(),
	groupId: z.string(),
	subaccountId: z.string().optional(),
});

export const getGroupInviteCode = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/invite-code",
		tags: ["WhatsApp"],
		summary: "Get a group's invite code and link",
	})
	.input(inviteInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			return await openwa.getGroupInviteCode(sender.openwaSessionId, input.groupId);
		} catch (error) {
			mapGroupError(error, "whatsapp.getGroupInviteCode");
		}
	});

export const revokeGroupInviteCode = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/invite-code/revoke",
		tags: ["WhatsApp"],
		summary: "Revoke and regenerate a group's invite code",
	})
	.input(inviteInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			return await openwa.revokeGroupInviteCode(sender.openwaSessionId, input.groupId);
		} catch (error) {
			mapGroupError(error, "whatsapp.revokeGroupInviteCode");
		}
	});
