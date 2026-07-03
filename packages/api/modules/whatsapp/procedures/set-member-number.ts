import { clearMemberDefaultNumber, setMemberDefaultNumber } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const setMemberNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/member-number",
		tags: ["WhatsApp"],
		summary: "Set or clear a member's default number",
		description:
			"Persist which of the subaccount's numbers a member sends from by default (sessionId null clears the default).",
	})
	.input(
		z.object({
			memberId: z.string(),
			sessionId: z.string().nullable(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		if (input.sessionId === null) {
			await clearMemberDefaultNumber(subaccount.id, input.memberId);
			return { ok: true };
		}

		await setMemberDefaultNumber({
			subaccountId: subaccount.id,
			memberId: input.memberId,
			sessionId: input.sessionId,
		});

		return { ok: true };
	});
