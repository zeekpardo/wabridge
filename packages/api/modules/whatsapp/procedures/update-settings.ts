import { upsertWhatsAppSettings } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const updateSettings = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/settings",
		tags: ["WhatsApp"],
		summary: "Update WhatsApp settings",
		description: "Set global spintax variables (SPINTAX_1..6) for the active organization.",
	})
	.input(
		z.object({
			// Map of variable name -> list of variations, e.g. { SPINTAX_1: ["Hi", "Hello"] }.
			globalSpintax: z.record(z.string(), z.array(z.string())),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		await upsertWhatsAppSettings(subaccount.id, { globalSpintax: input.globalSpintax });

		return { globalSpintax: input.globalSpintax };
	});
