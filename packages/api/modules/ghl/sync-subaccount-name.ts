import { getSubaccountById, updateSubaccount } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";

/**
 * Sync a GHL-linked subaccount's name from its GoHighLevel location.
 *
 * GHL owns the name for `provisioningSource:"ghl"` subaccounts — it isn't editable
 * in our app. We refresh it on connect and whenever the subaccount is viewed, so a
 * rename in GHL propagates. Best-effort: a missing link, missing connection, or GHL
 * hiccup logs and leaves the stored name untouched — it must never break a page.
 */
export async function syncSubaccountNameFromGhl(subaccountId: string): Promise<void> {
	try {
		const subaccount = await getSubaccountById(subaccountId);
		if (!subaccount?.ghlLocationId) {
			return;
		}

		const client = await createGoHighLevelClient(subaccountId);
		if (!client) {
			return;
		}

		const location = await client.getLocation();
		const name = location.name?.trim();
		if (name && name !== subaccount.name) {
			await updateSubaccount(subaccount.organizationId, subaccount.id, { name });
		}
	} catch (error) {
		logger.warn("GHL subaccount name sync failed", {
			ctx: "ghl.syncSubaccountName",
			subaccountId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
