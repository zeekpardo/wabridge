import { upsertWhatsAppSettings } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { MAX_STAFF_TRIGGERS, staffTriggerSchema } from "../types";

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
			globalSpintax: z.record(z.string(), z.array(z.string())).optional(),
			// Toggle the WhatsApp Groups feature for this subaccount.
			groupsEnabled: z.boolean().optional(),
			// Tag applied when a message is sent to a number not on WhatsApp ("" clears it).
			noWhatsappTag: z.string().max(120).optional(),
			// Staff triggers: outbound phrase -> CRM tag.
			staffTriggers: z.array(staffTriggerSchema).max(MAX_STAFF_TRIGGERS).optional(),
			// How a new contact's first sending number is chosen: owner default vs evenly distributed.
			numberAssignmentStrategy: z.enum(["owner", "distributed"]).optional(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		// Partial update: only the provided fields are written (undefined is skipped by the query).
		await upsertWhatsAppSettings(subaccount.id, {
			globalSpintax: input.globalSpintax,
			groupsEnabled: input.groupsEnabled,
			noWhatsappTag: input.noWhatsappTag,
			staffTriggers: input.staffTriggers,
			numberAssignmentStrategy: input.numberAssignmentStrategy,
		});

		return { ok: true };
	});
