import { getWhatsAppSettings } from "@repo/database";
import { type GlobalSpintax, processMessage } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

const attachmentSchema = z.object({
	url: z.string().url().optional(),
	base64: z.string().optional(),
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
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(
			session.activeOrganizationId,
			user.id,
			input.subaccountId,
		);

		const settings = await getWhatsAppSettings(subaccount.id);
		const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		return processMessage({
			text: input.text,
			attachments: input.attachments,
			globals,
		});
	});
