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
 * The subset of the auth session the scoping helper needs. A first-party
 * better-auth session provides `activeOrganizationId`; an embedded (GHL SSO)
 * session additionally carries a pre-authorized subaccount.
 */
export interface SessionScope {
	activeOrganizationId?: string | null;
	isEmbedded?: boolean;
	embeddedSubaccountId?: string | null;
}

/**
 * The scoping choke point for all WhatsApp/GHL data. Resolves and authorizes a
 * subaccount for the caller:
 *
 *  - Embedded (GHL SSO) sessions are pinned to the subaccount authorized at
 *    SSO-decrypt time; the client-supplied id is ignored and org membership is
 *    not re-checked (the SSO signature is the proof).
 *  - First-party sessions verify agency membership, then use the given
 *    `subaccountId` (must belong to the agency) or fall back to the agency's
 *    single subaccount — so existing single-tenant callers keep working.
 */
export async function resolveSubaccount(
	session: SessionScope,
	userId: string,
	subaccountId?: string | null,
): Promise<ResolvedSubaccount> {
	if (session.isEmbedded && session.embeddedSubaccountId && session.activeOrganizationId) {
		const embedded = await getSubaccount(
			session.activeOrganizationId,
			session.embeddedSubaccountId,
		);
		if (!embedded) {
			throw new ORPCError("FORBIDDEN", { message: "Embedded subaccount is no longer valid." });
		}
		return {
			id: embedded.id,
			organizationId: embedded.organizationId,
			name: embedded.name,
			ghlLocationId: embedded.ghlLocationId,
		};
	}

	const organizationId = await requireActiveOrganizationId(session.activeOrganizationId, userId);

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
