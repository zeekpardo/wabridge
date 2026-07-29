import { listRecoveryMessages } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/** The failed-send queue for the Recovery tab (defaults to pending). */
export const listRecovery = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/recovery",
		tags: ["WhatsApp"],
		summary: "List failed sends awaiting recovery",
		description:
			"Messages GHL tried to send that could not be delivered (number disconnected). Defaults to the pending queue; pass status to see recovered/dismissed.",
	})
	.input(
		z.object({
			subaccountId: z.string().optional(),
			status: z.enum(["pending", "recovered", "dismissed"]).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		return listRecoveryMessages(subaccount.id, input.status ?? "pending");
	});
