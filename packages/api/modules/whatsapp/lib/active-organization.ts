import { ORPCError } from "@orpc/server";
import { getDefaultSubaccount, getSubaccount } from "@repo/database";

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

export interface ResolvedSubaccount {
	id: string;
	organizationId: string;
	name: string;
	ghlLocationId: string | null;
}

/**
 * The scoping choke point for all WhatsApp/GHL data. Resolves and authorizes a
 * subaccount for the caller:
 *
 *  1. The active agency organization is read from the session and membership is
 *     verified (never trusts a client-supplied org id).
 *  2. If a `subaccountId` is given, it must belong to that agency; otherwise the
 *     agency's default (single) subaccount is used — so existing single-tenant
 *     callers keep working without passing an id.
 *
 * Throws `FORBIDDEN` when the subaccount isn't owned by the caller's agency and
 * `NOT_FOUND` when the agency has no subaccount yet.
 */
export async function resolveSubaccount(
	activeOrganizationId: string | null | undefined,
	userId: string,
	subaccountId?: string | null,
): Promise<ResolvedSubaccount> {
	const organizationId = await requireActiveOrganizationId(activeOrganizationId, userId);

	const subaccount = subaccountId
		? await getSubaccount(organizationId, subaccountId)
		: await getDefaultSubaccount(organizationId);

	if (!subaccount) {
		if (subaccountId) {
			throw new ORPCError("FORBIDDEN", {
				message: "Subaccount not found in this agency.",
			});
		}
		throw new ORPCError("NOT_FOUND", { message: "No subaccount available." });
	}

	return {
		id: subaccount.id,
		organizationId: subaccount.organizationId,
		name: subaccount.name,
		ghlLocationId: subaccount.ghlLocationId,
	};
}
