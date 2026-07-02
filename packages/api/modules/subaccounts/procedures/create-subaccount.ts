import { ORPCError } from "@orpc/server";
import { countSubaccounts, createSubaccount as createSubaccountRow } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../lib/agency";
import { getSubaccountLimit } from "../lib/plan-limits";

export const createSubaccount = protectedProcedure
	.route({
		method: "POST",
		path: "/subaccounts",
		tags: ["Subaccounts"],
		summary: "Create a subaccount",
		description:
			"Manually add a subaccount to the agency. GHL-provisioned subaccounts (provisioningSource=ghl) arrive via the marketplace flow; the source is fixed at creation.",
	})
	.input(
		z.object({
			name: z.string().min(1).max(120),
			// Only "manual" is exposed to clients today; "ghl" is set server-side by
			// the marketplace provisioning flow. The source is immutable once set.
			provisioningSource: z.literal("manual").default("manual"),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireAgencyId(session.activeOrganizationId, user.id);

		const [used, limit] = await Promise.all([
			countSubaccounts(organizationId),
			getSubaccountLimit(organizationId),
		]);
		if (used >= limit) {
			throw new ORPCError("FORBIDDEN", {
				message: Number.isFinite(limit)
					? `Sub-account limit reached (${limit}). Upgrade your plan to add more.`
					: "Sub-account limit reached.",
			});
		}

		return createSubaccountRow({
			organizationId,
			name: input.name.trim(),
			provisioningSource: input.provisioningSource,
		});
	});
