import { ORPCError } from "@orpc/server";
import { createWhatsAppMessage, getWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const sendTestMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/sessions/{id}/send-test",
		tags: ["WhatsApp"],
		summary: "Send a test message",
		description: "Sends a text message via OpenWA and records an outbound message",
	})
	.input(
		z.object({
			id: z.string(),
			toPhone: z.string().min(1),
			text: z.string().min(1),
		}),
	)
	.handler(async ({ input: { id, toPhone, text }, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const row = await getWhatsAppSession(organizationId, id);

		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const openwa = createOpenWaClient();
		const chatId = toChatId(toPhone);

		let result: { id?: string };
		try {
			result = await openwa.sendText(row.openwaSessionId, { chatId, text });
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.sendTestMessage", id });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		return createWhatsAppMessage({
			organizationId,
			sessionId: row.id,
			direction: "outbound",
			chatId,
			fromMe: true,
			type: "text",
			body: text,
			status: "sent",
			waMessageId: result?.id ?? null,
			timestamp: new Date(),
		});
	});
