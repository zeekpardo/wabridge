import { getConversation, getDefaultSession, getWhatsAppSession } from "@repo/database";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export interface HistoryMessage {
	id: string;
	waMessageId: string | null;
	direction: "inbound" | "outbound";
	body: string | null;
	type: string;
	status: string | null;
	timestamp: Date;
	fromMe: boolean;
	chatId: string;
}

export const getChatHistory = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/history",
		tags: ["WhatsApp"],
		summary: "Fetch a chat's WhatsApp history",
		description:
			"Reads the real message history for a contact live from WhatsApp (via OpenWA), so past conversations show even for contacts never messaged through WABridge.",
	})
	.input(z.object({ chatId: z.string(), limit: z.number().int().min(1).max(200).optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		// Which number owns this chat: the conversation's active number, else the default.
		const conversation = await getConversation(organizationId, input.chatId);
		const sender = conversation?.activeSessionId
			? await getWhatsAppSession(organizationId, conversation.activeSessionId)
			: await getDefaultSession(organizationId);

		if (!sender) {
			return [] as HistoryMessage[];
		}

		const openwa = createOpenWaClient();
		let history: Awaited<ReturnType<typeof openwa.getChatHistory>>;
		try {
			history = await openwa.getChatHistory(sender.openwaSessionId, input.chatId, input.limit ?? 50);
		} catch {
			return [] as HistoryMessage[];
		}

		return history
			.map<HistoryMessage>((message) => ({
				id: message.id,
				waMessageId: message.id,
				direction: message.fromMe ? "outbound" : "inbound",
				body: typeof message.body === "string" && message.body.length > 0 ? message.body : null,
				type: message.type ?? "text",
				status: null,
				timestamp: new Date(message.timestamp * 1000),
				fromMe: message.fromMe,
				chatId: input.chatId,
			}))
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	});
