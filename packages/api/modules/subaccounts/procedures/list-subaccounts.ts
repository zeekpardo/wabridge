import { countSubaccounts, listSubaccountsWithStats } from "@repo/database";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../lib/agency";

// Plan limits for the agency. Static defaults for now; wired to billing later.
const DEFAULT_MAX_SUBACCOUNTS = 25;
const DEFAULT_MAX_CONNECTIONS_PER_SUBACCOUNT = 5;

export const listSubaccounts = protectedProcedure
	.route({
		method: "GET",
		path: "/subaccounts",
		tags: ["Subaccounts"],
		summary: "List the agency's subaccounts (Control Panel)",
		description:
			"Roster of subaccounts with connection stats and GHL status, plus the agency's plan usage.",
	})
	.handler(async ({ context: { user, session } }) => {
		const organizationId = await requireAgencyId(session.activeOrganizationId, user.id);

		const [subaccounts, total] = await Promise.all([
			listSubaccountsWithStats(organizationId),
			countSubaccounts(organizationId),
		]);

		const connectionsOnline = subaccounts.reduce((sum, s) => sum + s.connectionsOnline, 0);
		const connectionsTotal = subaccounts.reduce((sum, s) => sum + s.connectionsTotal, 0);
		const ghlConnected = subaccounts.filter((s) => s.ghlConnected).length;

		return {
			subaccounts,
			limits: {
				subaccountsUsed: total,
				subaccountsMax: DEFAULT_MAX_SUBACCOUNTS,
				connectionsPerSubaccountMax: DEFAULT_MAX_CONNECTIONS_PER_SUBACCOUNT,
				connectionsOnline,
				connectionsTotal,
				ghlConnected,
			},
		};
	});
