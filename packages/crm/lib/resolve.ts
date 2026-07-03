import { getGhlConnection } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";

import type { CrmProvider } from "./provider";
import { GoHighLevelProvider } from "./providers/gohighlevel";

/**
 * Resolve the CRM provider for a subaccount, or null when none is connected.
 *
 * This is the ONE place that knows about specific CRMs: today it loads the
 * GoHighLevel connection and client and, when both are present, returns a
 * {@link GoHighLevelProvider}. Future CRMs branch here on the connection type;
 * every caller downstream stays vendor-agnostic.
 */
export async function resolveCrmProvider(subaccountId: string): Promise<CrmProvider | null> {
	const [client, connection] = await Promise.all([
		createGoHighLevelClient(subaccountId),
		getGhlConnection(subaccountId),
	]);
	if (!client || !connection) {
		return null;
	}
	return new GoHighLevelProvider(client, connection);
}
