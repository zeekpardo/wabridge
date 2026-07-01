import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, getWhatsAppSettings } from "@repo/database";
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
	url: z.string().url(),
	mimetype: z.string().optional(),
	filename: z.string().optional(),
});

export const sendMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/sessions/{id}/send",
		tags: ["WhatsApp"],
		summary: "Send a message (with command processing)",
		description:
			"Process commands (spintax, delay, media) and send the resulting actions from the given session.",
	})
	.input(
		z.object({
			id: z.string(),
			toPhone: z.string().min(1),
			text: z.string().default(""),
			attachments: z.array(attachmentSchema).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const row = await getWhatsAppSession(organizationId, input.id);
		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		const settings = await getWhatsAppSettings(organizationId);
		const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		const processed = processMessage({
			text: input.text,
			attachments: input.attachments,
			globals,
		});

		if (processed.actions.length === 0) {
			return { sent: 0, processed };
		}

		const result = await sendProcessedMessage(
			{
				openwaSessionId: row.openwaSessionId,
				sessionRowId: row.id,
				organizationId,
				chatId: toChatId(input.toPhone),
			},
			processed,
		);

		return { ...result, processed };
	});
