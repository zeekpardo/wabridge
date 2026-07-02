import { ORPCError } from "@orpc/server";
import { getGhlAuthUrl } from "@repo/integrations";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireAgencyId } from "../../subaccounts/lib/agency";
import { GHL_PROVISION_STATE } from "../ghl-constants";

/**
 * Build the GoHighLevel install URL for the Control Panel "Connect GoHighLevel"
 * add flow — no subaccount exists yet, so `state` carries the provision sentinel.
 * The callback exchanges the code and provisions a subaccount named after the
 * location.
 */
export const getGhlProvisionUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/ghl/provision-url",
		tags: ["WhatsApp"],
		summary: "Get the GoHighLevel install URL for provisioning a new subaccount",
	})
	.input(z.object({}).optional())
	.handler(async ({ context: { user, session } }) => {
		// Ensures the caller belongs to an agency org (throws otherwise).
		await requireAgencyId(session.activeOrganizationId, user.id);

		if (!process.env.GOHIGHLEVEL_CLIENT_ID || !process.env.GOHIGHLEVEL_REDIRECT_URI) {
			throw new ORPCError("NOT_IMPLEMENTED", {
				message: "GoHighLevel OAuth is not configured.",
			});
		}
		return { url: getGhlAuthUrl(GHL_PROVISION_STATE) };
	});
