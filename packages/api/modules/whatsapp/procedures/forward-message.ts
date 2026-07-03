import { ORPCError } from "@orpc/server";
import { createWhatsAppMessage } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient, toChatId } from "@repo/whatsapp";
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
		description:
			"Forwards a message to an existing chat (toChatId) or to a person by phone (toPhone) — a CRM contact or a team member from the owners list — and records it outbound.",
	})
	.input(
		z
			.object({
				fromChatId: z.string().optional(),
				toChatId: z.string().optional(),
				toPhone: z.string().optional(),
				messageId: z.string(),
				subaccountId: z.string().optional(),
			})
			.refine((value) => Boolean(value.toChatId || value.toPhone), {
				message: "Either toChatId or toPhone is required.",
			}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const toChat = input.toChatId ?? toChatId(input.toPhone ?? "");
		const fromChatId = input.fromChatId ?? toChat;

		const sender = await resolveSendingSession(subaccount.id, toChat);
		if (!sender) {
			throw new ORPCError("NOT_FOUND", { message: "No sendable number available." });
		}

		const openwa = createOpenWaClient();
		let result: { id?: string };
		try {
			result = await openwa.forwardMessage(sender.openwaSessionId, {
				fromChatId,
				toChatId: toChat,
				messageId: input.messageId,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.forwardMessage", toChatId: toChat });
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
			chatId: toChat,
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
