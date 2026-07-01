import { ORPCError } from "@orpc/server";

import { verifyOrganizationMembership } from "../../organizations/lib/membership";

/**
 * Resolves the caller's active organization id from the authenticated session
 * and verifies membership. Org id is NEVER accepted from client input — it is
 * always read from `session.activeOrganizationId` (set by Better Auth's
 * organization plugin) and confirmed via `verifyOrganizationMembership`.
 *
 * Throws `BAD_REQUEST` when no active organization is set and `FORBIDDEN` when
 * the caller is not a member.
 */
export async function requireActiveOrganizationId(
	activeOrganizationId: string | null | undefined,
	userId: string,
): Promise<string> {
	if (!activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "No active organization selected.",
		});
	}

	const membership = await verifyOrganizationMembership(activeOrganizationId, userId);

	if (!membership) {
		throw new ORPCError("FORBIDDEN");
	}

	return activeOrganizationId;
}
