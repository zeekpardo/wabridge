import { getGhlConnection } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";

import { GoHighLevelProvider } from "./providers/gohighlevel";
import { registerCrmProvider } from "./registry";

/**
 * Register the built-in CRM integrations. Importing this module (which `index.ts`
 * does) wires them into the registry. Adding a CRM is a single `registerCrmProvider`
 * call here — pointing at its own connection + provider impl — with no downstream
 * changes; every caller resolves providers via {@link resolveCrmProvider}.
 */
registerCrmProvider({
	type: "gohighlevel",
	label: "GoHighLevel",
	authType: "oauth",
	async load(subaccountId) {
		const [client, connection] = await Promise.all([
			createGoHighLevelClient(subaccountId),
			getGhlConnection(subaccountId),
		]);
		return client && connection ? new GoHighLevelProvider(client, connection) : null;
	},
});

export {
	getConnectedCrmType,
	listCrmProviders,
	registerCrmProvider,
	resolveCrmProvider,
} from "./registry";
export type { CrmProviderRegistration } from "./registry";
