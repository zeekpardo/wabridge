import { getWhatsAppSettings } from "@repo/database";
import { type GlobalSpintax, processMessage } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

const attachmentSchema = z.object({
	url: z.string().url(),
	mimetype: z.string().optional(),
	filename: z.string().optional(),
});

export const previewCommand = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/preview-command",
		tags: ["WhatsApp"],
		summary: "Preview command processing",
		description:
			"Parse a message's commands (spintax, delay, media) and return the resulting send-actions without sending. Spintax picks are random, so previews vary.",
	})
	.input(
		z.object({
			text: z.string().default(""),
			attachments: z.array(attachmentSchema).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const settings = await getWhatsAppSettings(organizationId);
		const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		return processMessage({
			text: input.text,
			attachments: input.attachments,
			globals,
		});
	});
