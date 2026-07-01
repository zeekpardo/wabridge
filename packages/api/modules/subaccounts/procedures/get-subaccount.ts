import { ORPCError } from "@orpc/server";
import { getGhlConnection, getSubaccount } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../lib/agency";

export const getSubaccountProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/subaccounts/{id}",
		tags: ["Subaccounts"],
		summary: "Get a subaccount (agency management page)",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireAgencyId(session.activeOrganizationId, user.id);

		const subaccount = await getSubaccount(organizationId, input.id);
		if (!subaccount) {
			throw new ORPCError("NOT_FOUND");
		}

		const ghl = await getGhlConnection(subaccount.id);

		return {
			id: subaccount.id,
			name: subaccount.name,
			status: subaccount.status,
			provisioningSource: subaccount.provisioningSource,
			ghlLocationId: subaccount.ghlLocationId,
			whiteLabel: subaccount.whiteLabel,
			createdAt: subaccount.createdAt,
			ghl: {
				connected: Boolean(ghl),
				locationId: ghl?.locationId ?? null,
				needsReconnect: ghl?.needsReconnect ?? false,
			},
		};
	});
