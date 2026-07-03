import { ORPCError } from "@orpc/server";
import { markConversationRead } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { resolveSendingSession } from "./lib-session";

export const markChatRead = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/mark-read",
		tags: ["WhatsApp"],
		summary: "Mark a chat read",
		description: "Marks a chat as read/seen on WhatsApp and clears its unread count.",
	})
	.input(
		z.object({
			chatId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const sender = await resolveSendingSession(subaccount.id, input.chatId);
		if (!sender) {
			throw new ORPCError("NOT_FOUND", { message: "No sendable number available." });
		}

		const openwa = createOpenWaClient();
		try {
			await openwa.markChatRead(sender.openwaSessionId, input.chatId);
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.markChatRead", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		await markConversationRead(subaccount.id, input.chatId);

		return { ok: true };
	});
