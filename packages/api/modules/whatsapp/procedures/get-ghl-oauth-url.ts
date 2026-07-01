import { ORPCError } from "@orpc/server";
import { getSubaccountById } from "@repo/database";
import { getGhlAuthUrl } from "@repo/integrations";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { verifyOrganizationMembership } from "../../organizations/lib/membership";

/**
 * Build the GoHighLevel install URL for a subaccount. The subaccount id rides in
 * `state` (GHL echoes it back), so the callback knows which subaccount to attach
 * the connection to — no signed token needed; the connect mutation is
 * authenticated and membership-checked.
 */
export const getGhlOAuthUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/ghl/oauth-url",
		tags: ["WhatsApp"],
		summary: "Get the GoHighLevel install URL for a subaccount",
	})
	.input(z.object({ subaccountId: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		const subaccount = await getSubaccountById(input.subaccountId);
		if (!subaccount) {
			throw new ORPCError("NOT_FOUND", { message: "Subaccount not found." });
		}
		const membership = await verifyOrganizationMembership(subaccount.organizationId, user.id);
		if (!membership) {
			throw new ORPCError("FORBIDDEN");
		}
		if (!process.env.GOHIGHLEVEL_CLIENT_ID || !process.env.GOHIGHLEVEL_REDIRECT_URI) {
			throw new ORPCError("NOT_IMPLEMENTED", {
				message: "GoHighLevel OAuth is not configured.",
			});
		}
		return { url: getGhlAuthUrl(subaccount.id) };
	});
