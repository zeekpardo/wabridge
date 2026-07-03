import { ORPCError } from "@orpc/server";
import { createWhatsAppMessage } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { listAssignableOwners } from "../lib/assignable-owners";
import { resolveSendingSession } from "./lib-session";

export const forwardMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/forward",
		tags: ["WhatsApp"],
		summary: "Forward a message",
		description: "Forwards a message from one chat to another and records it outbound.",
	})
	.input(
		z.object({
			fromChatId: z.string().optional(),
			toChatId: z.string(),
			messageId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const fromChatId = input.fromChatId ?? input.toChatId;

		const sender = await resolveSendingSession(subaccount.id, input.toChatId);
		if (!sender) {
			throw new ORPCError("NOT_FOUND", { message: "No sendable number available." });
		}

		const openwa = createOpenWaClient();
		let result: { id?: string };
		try {
			result = await openwa.forwardMessage(sender.openwaSessionId, {
				fromChatId,
				toChatId: input.toChatId,
				messageId: input.messageId,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.forwardMessage", toChatId: input.toChatId });
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
			chatId: input.toChatId,
			fromMe: true,
			type: "text",
			body: "[forwarded]",
			status: "sent",
			waMessageId: result?.id ?? null,
			origin: "app",
			sentByUserId: senderOwnerId,
			sentByName,
			timestamp: new Date(),
		});
	});
