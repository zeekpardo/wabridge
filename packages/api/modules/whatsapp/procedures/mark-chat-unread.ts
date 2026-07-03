import { ORPCError } from "@orpc/server";
import { setConversationUnread } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { resolveSendingSession } from "./lib-session";

export const markChatUnread = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/mark-unread",
		tags: ["WhatsApp"],
		summary: "Mark a chat unread",
		description: "Marks a chat as unread on WhatsApp and flags it unread locally.",
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
			await openwa.markChatUnread(sender.openwaSessionId, input.chatId);
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.markChatUnread", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		await setConversationUnread({
			subaccountId: subaccount.id,
			chatId: input.chatId,
			unread: true,
		});

		return { ok: true };
	});
