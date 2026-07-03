import { getConnectedCrmType, listCrmProviders } from "@repo/crm";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * Every registered CRM integration, each flagged with whether this subaccount is
 * connected to it — drives a "connect a CRM" picker. Adding a CRM to the registry
 * makes it appear here automatically.
 */
export const listCrmConnections = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/crm-connections",
		tags: ["WhatsApp"],
		summary: "List available CRM integrations and which one is connected",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const connectedType = await getConnectedCrmType(subaccount.id);
		return listCrmProviders().map((provider) => ({
			...provider,
			connected: provider.type === connectedType,
		}));
	});
