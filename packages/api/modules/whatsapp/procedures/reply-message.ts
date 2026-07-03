import { ORPCError } from "@orpc/server";
import { createWhatsAppMessage } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { listAssignableOwners } from "../lib/assignable-owners";
import { resolveSendingSession } from "./lib-session";

export const replyMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/reply",
		tags: ["WhatsApp"],
		summary: "Reply to a message (quoted)",
		description: "Sends a text reply that quotes an existing message and records it outbound.",
	})
	.input(
		z.object({
			chatId: z.string(),
			quotedMessageId: z.string(),
			text: z.string().min(1),
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
		let result: { id?: string };
		try {
			result = await openwa.replyMessage(sender.openwaSessionId, {
				chatId: input.chatId,
				quotedMessageId: input.quotedMessageId,
				text: input.text,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.replyMessage", chatId: input.chatId });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		const senderOwnerId = user.id.startsWith("ghl:") ? user.id.slice(4) : user.id;
		let sentByName = typeof user.name === "string" && user.name.trim() ? user.name.trim() : null;
		if (!sentByName && senderOwnerId && senderOwnerId !== "sso") {
			const owners = await listAssignableOwners(subaccount).catch(() => []);
			sentByName = owners.find((owner) => owner.id === senderOwnerId)?.name ?? null;
		}

		return createWhatsAppMessage({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			sessionId: sender.id,
			direction: "outbound",
			chatId: input.chatId,
			fromMe: true,
			type: "text",
			body: input.text,
			status: "sent",
			waMessageId: result?.id ?? null,
			quotedMessageId: input.quotedMessageId,
			origin: "app",
			sentByUserId: senderOwnerId,
			sentByName,
			timestamp: new Date(),
		});
	});
