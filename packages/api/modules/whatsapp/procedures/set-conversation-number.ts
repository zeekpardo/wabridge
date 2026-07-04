import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, setConversationActiveSession } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const setConversationNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/conversations/active-number",
		tags: ["WhatsApp"],
		summary: "Set a conversation's active number",
		description:
			"Persist which of the org's numbers replies to a contact (the UI 'Send from'). Transient — does NOT change the contact's primary number (use setPrimaryNumber for that).",
	})
	.input(
		z.object({
			chatId: z.string(),
			sessionId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const target = await getWhatsAppSession(subaccount.id, input.sessionId);
		if (!target) {
			throw new ORPCError("NOT_FOUND", { message: "Number not found for this subaccount." });
		}

		// Send-from only: this must NOT touch the contact's primary number (the `wa:` tag). Changing the
		// primary is a separate, intentional action — see setPrimaryNumber.
		return setConversationActiveSession({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			sessionId: input.sessionId,
		});
	});
