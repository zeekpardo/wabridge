import { getWhatsAppSettings, upsertWhatsAppSettings } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { parseMessageTemplates } from "../types";

export const deleteMessageTemplate = protectedProcedure
	.route({
		method: "DELETE",
		path: "/whatsapp/message-templates/{id}",
		tags: ["WhatsApp"],
		summary: "Delete a bulk-message template",
	})
	.input(z.object({ id: z.string(), subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const settings = await getWhatsAppSettings(subaccount.id);
		const templates = parseMessageTemplates(settings?.messageTemplates).filter(
			(entry) => entry.id !== input.id,
		);

		await upsertWhatsAppSettings(subaccount.id, { messageTemplates: templates });

		return { templates };
	});
