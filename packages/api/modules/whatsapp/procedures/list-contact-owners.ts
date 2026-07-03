import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { type AssignableOwner, listAssignableOwners } from "../lib/assignable-owners";

export type ContactOwnerOption = AssignableOwner;

/**
 * The assignable owners for a contact — the single source of "who can be
 * assigned" (see {@link listAssignableOwners}). The owner-number settings list
 * uses the same source so the two dropdowns always agree.
 */
export const listContactOwners = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/contact-owners",
		tags: ["WhatsApp"],
		summary: "List assignable contact owners",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<ContactOwnerOption[]> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		return listAssignableOwners(subaccount);
	});
