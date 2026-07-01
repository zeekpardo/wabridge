import { upsertWhatsAppSettings } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

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
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		await upsertWhatsAppSettings(organizationId, { globalSpintax: input.globalSpintax });

		return { globalSpintax: input.globalSpintax };
	});
