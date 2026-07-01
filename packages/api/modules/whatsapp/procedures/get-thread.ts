import { getConversation, listThreadMessages, markConversationRead } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const getThread = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/thread",
		tags: ["WhatsApp"],
		summary: "Get a conversation thread",
		description:
			"Messages for a contact (oldest first) plus the conversation state. Marks the thread as read.",
	})
	.input(
		z.object({
			chatId: z.string(),
			limit: z.number().int().min(1).max(200).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		await markConversationRead(organizationId, input.chatId);

		const [messages, conversation] = await Promise.all([
			listThreadMessages(organizationId, input.chatId, input.limit ?? 50),
			getConversation(organizationId, input.chatId),
		]);

		return { messages, conversation };
	});
