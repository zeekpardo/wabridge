import { ORPCError } from "@orpc/server";
import { getWhatsAppSession, setSessionPriority, updateWhatsAppSession } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * Update a connected number's editable settings: its display `label` and its send
 * `priority` (1 = highest; powers default routing + `#switch|N`). Priority changes
 * swap with the current holder so priorities stay unique within the subaccount.
 */
export const updateNumber = protectedProcedure
	.route({
		method: "PATCH",
		path: "/whatsapp/numbers/{id}",
		tags: ["WhatsApp"],
		summary: "Update a number's name and/or send priority",
	})
	.input(
		z.object({
			id: z.string(),
			subaccountId: z.string().optional(),
			/** New display name. Empty string clears it (falls back to phone). */
			label: z.string().trim().max(100).optional(),
			/** New send priority (1 = highest). Swaps with the current holder. */
			priority: z.number().int().min(1).optional(),
		}),
	)
	.handler(async ({ input: { id, subaccountId, label, priority }, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, subaccountId);

		const row = await getWhatsAppSession(subaccount.id, id);
		if (!row) {
			throw new ORPCError("NOT_FOUND");
		}

		if (label !== undefined) {
			await updateWhatsAppSession(subaccount.id, id, { label: label || null });
		}
		if (priority !== undefined) {
			await setSessionPriority(subaccount.id, id, priority);
		}

		return { success: true };
	});
