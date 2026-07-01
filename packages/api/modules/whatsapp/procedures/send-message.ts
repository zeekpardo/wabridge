import { ORPCError } from "@orpc/server";
import {
	getConversation,
	getDefaultSession,
	getSessionByPriority,
	getWhatsAppSession,
	getWhatsAppSettings,
	setConversationActiveSession,
	touchConversationOutbound,
} from "@repo/database";
import {
	type GlobalSpintax,
	processMessage,
	sendProcessedMessage,
	toChatId,
} from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

const attachmentSchema = z.object({
	url: z.string().url().optional(),
	base64: z.string().optional(),
	mimetype: z.string().optional(),
	filename: z.string().optional(),
});

export const sendMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/send",
		tags: ["WhatsApp"],
		summary: "Send a message (commands + number routing)",
		description:
			"Process commands (spintax, delay, media, #switch) and send from the resolved number: explicit fromSessionId, else #switch priority, else the conversation's active number, else the default.",
	})
	.input(
		z
			.object({
				chatId: z.string().optional(),
				toPhone: z.string().optional(),
				text: z.string().default(""),
				attachments: z.array(attachmentSchema).optional(),
				fromSessionId: z.string().optional(),
			})
			.refine((value) => Boolean(value.chatId || value.toPhone), {
				message: "Either chatId or toPhone is required.",
			}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const chatId = input.chatId ?? toChatId(input.toPhone ?? "");

		const settings = await getWhatsAppSettings(organizationId);
		const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		const processed = processMessage({
			text: input.text,
			attachments: input.attachments,
			globals,
		});

		// Resolve which number sends.
		let sender: Awaited<ReturnType<typeof getWhatsAppSession>> | null = null;

		if (processed.numberOverride) {
			sender = await getSessionByPriority(organizationId, processed.numberOverride.priority);
			if (!sender) {
				throw new ORPCError("NOT_FOUND", {
					message: `No number with priority ${processed.numberOverride.priority}.`,
				});
			}
			if (processed.numberOverride.scope === "session") {
				await setConversationActiveSession(organizationId, chatId, sender.id);
			}
		} else if (input.fromSessionId) {
			sender = await getWhatsAppSession(organizationId, input.fromSessionId);
		} else {
			const conversation = await getConversation(organizationId, chatId);
			if (conversation?.activeSessionId) {
				sender = await getWhatsAppSession(organizationId, conversation.activeSessionId);
			}
			if (!sender) {
				sender = await getDefaultSession(organizationId);
			}
		}

		if (!sender) {
			throw new ORPCError("NOT_FOUND", { message: "No sendable number available." });
		}

		// A bare #switch changes the active number but sends nothing.
		if (processed.actions.length === 0) {
			return { sent: 0, processed, fromSessionId: sender.id };
		}

		const result = await sendProcessedMessage(
			{
				openwaSessionId: sender.openwaSessionId,
				sessionRowId: sender.id,
				organizationId,
				chatId,
			},
			processed,
		);

		const firstText = processed.actions.find((action) => action.text)?.text;
		const preview = firstText ?? `[${processed.actions[0]?.kind ?? "message"}]`;
		await touchConversationOutbound({ organizationId, chatId, sessionId: sender.id, preview });

		return { ...result, processed, fromSessionId: sender.id };
	});
