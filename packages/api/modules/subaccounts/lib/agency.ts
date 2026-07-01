import { ORPCError } from "@orpc/server";

import { verifyOrganizationMembership } from "../../organizations/lib/membership";

/**
 * Resolves and authorizes the caller's active agency (Organization). Mirrors the
 * WhatsApp scoping helper: the org id is read from the session (never client
 * input) and membership is verified. Agency-level surfaces (the Control Panel,
 * subaccount CRUD) scope by this id.
 */
export async function requireAgencyId(
	activeOrganizationId: string | null | undefined,
	userId: string,
): Promise<string> {
	if (!activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", { message: "No active agency selected." });
	}

	const membership = await verifyOrganizationMembership(activeOrganizationId, userId);
	if (!membership) {
		throw new ORPCError("FORBIDDEN");
	}

	return activeOrganizationId;
}
