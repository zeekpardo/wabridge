import { getPurchasesByOrganizationId } from "@repo/database";
import { createPurchasesHelper } from "@repo/payments/lib/helper";

/**
 * Sub-accounts included per plan. Keep in sync with the plans in
 * `packages/payments/config.ts`.
 */
export const SUBACCOUNT_LIMITS: Record<string, number> = {
	solo: 1,
	starter: 3,
	pro: 5,
	agency: 10,
	enterprise: 20,
};

/**
 * The sub-account cap for an organization, derived from its active subscription.
 *
 * No active subscription → `Infinity` (unlimited): during the invite-only testing
 * phase (`requireActiveSubscription: false`) the caps don't bite until a plan is
 * purchased. An unrecognised plan also falls back to unlimited rather than locking
 * an org out.
 */
export async function getSubaccountLimit(organizationId: string): Promise<number> {
	const purchases = await getPurchasesByOrganizationId(organizationId);
	const { activePlan } = createPurchasesHelper(purchases);
	if (!activePlan) {
		return Number.POSITIVE_INFINITY;
	}
	return SUBACCOUNT_LIMITS[activePlan.id] ?? Number.POSITIVE_INFINITY;
}
