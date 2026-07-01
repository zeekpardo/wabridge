import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, setConversationActiveSession } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const setConversationNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/conversations/active-number",
		tags: ["WhatsApp"],
		summary: "Set a conversation's active number",
		description: "Persist which of the org's numbers replies to a contact (the UI 'Send from').",
	})
	.input(z.object({ chatId: z.string(), sessionId: z.string() }))
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const target = await getWhatsAppSession(organizationId, input.sessionId);
		if (!target) {
			throw new ORPCError("NOT_FOUND", { message: "Number not found for this organization." });
		}

		return setConversationActiveSession(organizationId, input.chatId, input.sessionId);
	});
