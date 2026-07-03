import { clearOwnerDefaultNumber, setOwnerDefaultNumber } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const setOwnerNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/owner-number",
		tags: ["WhatsApp"],
		summary: "Set or clear an owner's default number",
		description:
			"Persist which of the subaccount's numbers an owner (GHL staff user / agency member) sends from by default. `ownerId` is the id from listContactOwners; sessionId null clears the default.",
	})
	.input(
		z.object({
			ownerId: z.string(),
			sessionId: z.string().nullable(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		if (input.sessionId === null) {
			await clearOwnerDefaultNumber(subaccount.id, input.ownerId);
			return { ok: true };
		}

		await setOwnerDefaultNumber({
			subaccountId: subaccount.id,
			ownerId: input.ownerId,
			sessionId: input.sessionId,
		});

		return { ok: true };
	});
