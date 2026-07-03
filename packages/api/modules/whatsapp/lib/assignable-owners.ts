import { getGhlConnection, listOrganizationMembers } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";

export interface AssignableOwner {
	id: string;
	name: string;
	email: string;
	/** The owner's phone (E.164-ish), when known — lets us forward a chat to them. */
	phone: string | null;
	image: string | null;
	role: string;
	/** Where this option comes from: a GHL location user or an agency member. */
	source: "ghl" | "local";
}

/**
 * The people a contact can be assigned to — and, equivalently, the people who
 * can be given a default sending number. GHL-connected subaccounts list the
 * location's staff (ids are GHL user ids, mirroring GHL's own owner dropdown);
 * standalone subaccounts list agency members (ids are app user ids). Falls back
 * to members when the GHL users fetch fails.
 *
 * The returned `id` is the canonical "owner id" used across the app: contact
 * ownership (`conversation.ownerId`), owner-number defaults, and the acting
 * user of an embedded send all key on this same id space.
 */
export async function listAssignableOwners(subaccount: {
	id: string;
	organizationId: string;
}): Promise<AssignableOwner[]> {
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
					phone: ghlUser.phone?.trim() || null,
					image: null,
					role: ghlUser.roles?.role ?? "staff",
					source: "ghl" as const,
				}));
			}
		} catch (error) {
			logger.warn("GHL users fetch failed; falling back to agency members", {
				ctx: "whatsapp.assignableOwners",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const members = await listOrganizationMembers(subaccount.organizationId);
	return members.map((member) => ({
		id: member.userId,
		name: member.user.name || member.user.email,
		email: member.user.email,
		phone: null,
		image: member.user.image ?? null,
		role: member.role,
		source: "local" as const,
	}));
}
