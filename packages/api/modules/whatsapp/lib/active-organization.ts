import { ORPCError } from "@orpc/server";
import {
	countSubaccounts,
	getDefaultSubaccount,
	getSubaccount,
	getSubaccountById,
} from "@repo/database";

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

	// Explicit subaccount: authorize by the subaccount's OWN organization, not the
	// session's active org. A multi-org user's active org can drift from the page
	// they're viewing; scoping off it would either wrongly deny access or — for
	// calls that omit the id — silently fall through to another tenant's data.
	if (subaccountId) {
		const subaccount = await getSubaccountById(subaccountId);
		if (!subaccount || !(await verifyOrganizationMembership(subaccount.organizationId, userId))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Subaccount not found in your organizations.",
			});
		}
		return {
			id: subaccount.id,
			organizationId: subaccount.organizationId,
			name: subaccount.name,
			ghlLocationId: subaccount.ghlLocationId,
		};
	}

	// No subaccount specified: safe ONLY when the active org has exactly one.
	// Silently defaulting to the oldest would leak a sibling subaccount's data
	// once an agency has several — so fail closed and require the caller to name it.
	const organizationId = await requireActiveOrganizationId(session.activeOrganizationId, userId);
	const count = await countSubaccounts(organizationId);
	if (count > 1) {
		throw new ORPCError("BAD_REQUEST", {
			message: "This agency has multiple subaccounts — specify which one.",
		});
	}
	const subaccount = await getDefaultSubaccount(organizationId);
	if (!subaccount) {
		throw new ORPCError("NOT_FOUND", { message: "No subaccount available." });
	}
	return {
		id: subaccount.id,
		organizationId: subaccount.organizationId,
		name: subaccount.name,
		ghlLocationId: subaccount.ghlLocationId,
	};
}
