import { createOpenWaClient, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

/**
 * Send a group's invite link to numbers that couldn't be added directly (WhatsApp privacy). The link
 * is fetched once and messaged to each phone from the group's own number, so recipients can self-join.
 * Per-phone failures are reported (never throw the whole call) so a single bad number doesn't sink the rest.
 */
export const inviteToGroup = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/invite/send",
		tags: ["WhatsApp"],
		summary: "Send a group's invite link to the given phone numbers",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			phones: z.array(z.string().min(1)).min(1),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		let inviteLink: string;
		try {
			const invite = await openwa.getGroupInviteCode(sender.openwaSessionId, input.groupId);
			inviteLink = invite.inviteLink;
		} catch (error) {
			mapGroupError(error, "whatsapp.inviteToGroup.code");
		}

		const text = `You've been invited to join this WhatsApp group. Tap to join: ${inviteLink}`;
		let sent = 0;
		const failed: string[] = [];
		for (const phone of input.phones) {
			try {
				await openwa.sendText(sender.openwaSessionId, { chatId: toChatId(phone), text });
				sent += 1;
			} catch {
				failed.push(phone);
			}
		}

		return { ok: true, sent, failed };
	});
