import { ORPCError } from "@orpc/server";
import { applyMessageReaction } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { resolveSendingSession } from "./lib-session";

export const reactMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/react",
		tags: ["WhatsApp"],
		summary: "React to a message",
		description: "Sends an emoji reaction (empty emoji removes it) and records it on the message.",
	})
	.input(
		z.object({
			chatId: z.string(),
			messageId: z.string(),
			emoji: z.string(),
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
			await openwa.reactMessage(sender.openwaSessionId, {
				chatId: input.chatId,
				messageId: input.messageId,
				emoji: input.emoji,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.reactMessage", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		await applyMessageReaction({
			subaccountId: subaccount.id,
			waMessageId: input.messageId,
			emoji: input.emoji,
			senderId: "me",
			fromMe: true,
			remove: input.emoji === "",
		});

		return { ok: true };
	});
