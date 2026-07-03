import { ORPCError } from "@orpc/server";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { resolveSendingSession } from "./lib-session";

export const setTyping = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/typing",
		tags: ["WhatsApp"],
		summary: "Set a chat presence indicator",
		description: "Shows or clears a typing/recording indicator in a chat. Not persisted.",
	})
	.input(
		z.object({
			chatId: z.string(),
			state: z.enum(["typing", "recording", "paused"]),
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
			await openwa.sendChatState(sender.openwaSessionId, input.chatId, input.state);
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.setTyping", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		return { ok: true };
	});
