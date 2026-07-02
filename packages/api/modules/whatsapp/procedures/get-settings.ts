import { getWhatsAppSettings } from "@repo/database";
import type { GlobalSpintax } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { parseMessageTemplates } from "../types";

export const getSettings = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/settings",
		tags: ["WhatsApp"],
		summary: "Get WhatsApp settings",
		description:
			"Global spintax variables and saved bulk-message templates for the resolved subaccount.",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const settings = await getWhatsAppSettings(subaccount.id);
		const globalSpintax = (settings?.globalSpintax as GlobalSpintax | null) ?? {};
		const messageTemplates = parseMessageTemplates(settings?.messageTemplates);

		return { globalSpintax, messageTemplates };
	});
