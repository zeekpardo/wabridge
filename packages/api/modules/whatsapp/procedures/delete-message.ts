import { ORPCError } from "@orpc/server";
import { markMessageDeleted } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { resolveSendingSession } from "./lib-session";

export const deleteMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/delete",
		tags: ["WhatsApp"],
		summary: "Delete a message",
		description: "Deletes/revokes a message (for everyone by default) and marks it deleted.",
	})
	.input(
		z.object({
			chatId: z.string(),
			messageId: z.string(),
			forEveryone: z.boolean().default(true),
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
			await openwa.deleteMessage(sender.openwaSessionId, {
				chatId: input.chatId,
				messageId: input.messageId,
				forEveryone: input.forEveryone,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.deleteMessage", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		await markMessageDeleted(subaccount.id, input.messageId);

		return { ok: true };
	});
