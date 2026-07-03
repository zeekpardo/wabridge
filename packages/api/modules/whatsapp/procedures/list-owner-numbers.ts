import { listOwnerDefaultNumbers } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { listAssignableOwners } from "../lib/assignable-owners";

export interface OwnerNumber {
	ownerId: string;
	name: string;
	email: string;
	source: "ghl" | "local";
	/** The owner's default sending number, or null when unset. */
	sessionId: string | null;
}

/**
 * Each assignable owner (the SAME list as the contact-owner dropdown on the
 * right aside) paired with their default sending number for the resolved
 * subaccount — for the settings UI. Owners with no default get null.
 */
export const listOwnerNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/owner-numbers",
		tags: ["WhatsApp"],
		summary: "List assignable owners with their default numbers",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<OwnerNumber[]> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const [owners, defaults] = await Promise.all([
			listAssignableOwners(subaccount),
			listOwnerDefaultNumbers(subaccount.id),
		]);

		const sessionByOwner = new Map(defaults.map((row) => [row.ownerId, row.sessionId]));

		return owners.map((owner) => ({
			ownerId: owner.id,
			name: owner.name,
			email: owner.email,
			source: owner.source,
			sessionId: sessionByOwner.get(owner.id) ?? null,
		}));
	});
