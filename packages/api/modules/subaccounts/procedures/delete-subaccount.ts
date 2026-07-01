import { ORPCError } from "@orpc/server";
import { deleteSubaccount as deleteSubaccountRow } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../lib/agency";

export const deleteSubaccount = protectedProcedure
	.route({
		method: "DELETE",
		path: "/subaccounts/{id}",
		tags: ["Subaccounts"],
		summary: "Delete a subaccount",
		description:
			"Removes the subaccount and cascades its WhatsApp/GHL data. The OpenWA sessions themselves should be disconnected first via the numbers UI.",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user, session } }) => {
		const organizationId = await requireAgencyId(session.activeOrganizationId, user.id);

		const removed = await deleteSubaccountRow(organizationId, input.id);
		if (!removed) {
			throw new ORPCError("NOT_FOUND");
		}
		return { success: true };
	});
