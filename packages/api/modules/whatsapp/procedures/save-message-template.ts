import { ORPCError } from "@orpc/server";
import { getWhatsAppSettings, upsertWhatsAppSettings } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { MAX_MESSAGE_TEMPLATES, type MessageTemplate, parseMessageTemplates } from "../types";

export const saveMessageTemplate = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/message-templates",
		tags: ["WhatsApp"],
		summary: "Save a bulk-message template",
		description:
			"Create or update (by id) a saved bulk-message template for the resolved subaccount.",
	})
	.input(
		z.object({
			id: z.string().optional(),
			name: z.string().trim().min(1).max(120),
			text: z.string().min(1).max(5000),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const settings = await getWhatsAppSettings(subaccount.id);
		const existing = parseMessageTemplates(settings?.messageTemplates);

		const template: MessageTemplate = {
			id: input.id ?? crypto.randomUUID(),
			name: input.name,
			text: input.text,
			updatedAt: new Date().toISOString(),
		};

		const index = existing.findIndex((entry) => entry.id === template.id);
		let templates: MessageTemplate[];
		if (index >= 0) {
			templates = existing.map((entry) => (entry.id === template.id ? template : entry));
		} else {
			if (existing.length >= MAX_MESSAGE_TEMPLATES) {
				throw new ORPCError("BAD_REQUEST", {
					message: `You can save up to ${MAX_MESSAGE_TEMPLATES} templates. Delete one first.`,
				});
			}
			templates = [template, ...existing];
		}

		await upsertWhatsAppSettings(subaccount.id, { messageTemplates: templates });

		return { templates };
	});
