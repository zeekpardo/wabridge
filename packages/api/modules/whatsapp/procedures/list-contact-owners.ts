import { listOrganizationMembers } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface ContactOwnerOption {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
}

export const listContactOwners = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/contact-owners",
		tags: ["WhatsApp"],
		summary: "List assignable contact owners (agency members)",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<ContactOwnerOption[]> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const members = await listOrganizationMembers(subaccount.organizationId);
		return members.map((member) => ({
			id: member.userId,
			name: member.user.name || member.user.email,
			email: member.user.email,
			image: member.user.image ?? null,
			role: member.role,
		}));
	});
