import { ORPCError } from "@orpc/server";
import { updateSubaccount as updateSubaccountRow } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../lib/agency";

export const updateSubaccount = protectedProcedure
	.route({
		method: "PATCH",
		path: "/subaccounts/{id}",
		tags: ["Subaccounts"],
		summary: "Update a subaccount (name, status, white-label)",
	})
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(120).optional(),
			status: z.enum(["active", "paused"]).optional(),
			whiteLabel: z.record(z.string(), z.unknown()).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireAgencyId(session.activeOrganizationId, user.id);

		const updated = await updateSubaccountRow(organizationId, input.id, {
			name: input.name,
			status: input.status,
			whiteLabel: input.whiteLabel,
		});
		if (!updated) {
			throw new ORPCError("NOT_FOUND");
		}
		return updated;
	});
