import { getGhlConnection, listOrganizationMembers } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface ContactOwnerOption {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
	/** Where this option comes from: a GHL location user or an agency member. */
	source: "ghl" | "local";
}

/**
 * The assignable owners for a contact. GHL-connected subaccounts list the
 * location's staff (mirroring GHL's own owner dropdown; ids are GHL user ids);
 * standalone subaccounts list agency members. Falls back to members when the
 * GHL users fetch fails.
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

		const ghl = await getGhlConnection(subaccount.id);
		if (ghl) {
			try {
				const client = await createGoHighLevelClient(subaccount.id);
				if (client) {
					const users = await client.getUsers();
					return users.map((ghlUser) => ({
						id: ghlUser.id,
						name:
							[ghlUser.firstName, ghlUser.lastName].filter(Boolean).join(" ") ||
							ghlUser.name ||
							ghlUser.email ||
							"GHL user",
						email: ghlUser.email ?? "",
						image: null,
						role: ghlUser.roles?.role ?? "staff",
						source: "ghl" as const,
					}));
				}
			} catch (error) {
				logger.warn("GHL users fetch failed; falling back to agency members", {
					ctx: "whatsapp.contactOwners",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const members = await listOrganizationMembers(subaccount.organizationId);
		return members.map((member) => ({
			id: member.userId,
			name: member.user.name || member.user.email,
			email: member.user.email,
			image: member.user.image ?? null,
			role: member.role,
			source: "local" as const,
		}));
	});
