import { dismissRecoveryMessage } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/** Clear a failed send from the Recovery queue without resending it. */
export const dismissRecovery = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/recovery/dismiss",
		tags: ["WhatsApp"],
		summary: "Dismiss a failed send",
		description: "Mark a recovery row dismissed so it leaves the pending queue without a resend.",
	})
	.input(z.object({ subaccountId: z.string().optional(), id: z.string() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		await dismissRecoveryMessage(subaccount.id, input.id);
		return { ok: true };
	});
