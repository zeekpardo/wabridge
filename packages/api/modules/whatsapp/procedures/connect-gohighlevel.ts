import { ORPCError } from "@orpc/server";
import { getSubaccountById, updateSubaccount, upsertGhlConnection } from "@repo/database";
import { encrypt, exchangeGhlCode } from "@repo/integrations";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { verifyOrganizationMembership } from "../../organizations/lib/membership";

/**
 * Exchange the GoHighLevel OAuth code (from the install callback page) and store
 * the connection against the subaccount carried in `state`. Runs in the user's
 * authenticated session; access is verified against the subaccount's agency org.
 */
export const connectGoHighLevel = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/ghl/connect",
		tags: ["WhatsApp"],
		summary: "Exchange the GHL OAuth code and store the connection",
	})
	.input(z.object({ subaccountId: z.string(), code: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		const subaccount = await getSubaccountById(input.subaccountId);
		if (!subaccount) {
			throw new ORPCError("NOT_FOUND", { message: "Subaccount not found." });
		}
		const membership = await verifyOrganizationMembership(subaccount.organizationId, user.id);
		if (!membership) {
			throw new ORPCError("FORBIDDEN");
		}

		const tokens = await exchangeGhlCode(input.code);
		if (!tokens.locationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No location returned from GoHighLevel — pick a location during install.",
			});
		}

		await upsertGhlConnection({
			subaccountId: subaccount.id,
			locationId: tokens.locationId,
			companyId: tokens.companyId ?? null,
			userId: tokens.userId ?? null,
			accessToken: encrypt(tokens.access_token),
			refreshToken: encrypt(tokens.refresh_token),
			tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
			conversationProviderId: process.env.GOHIGHLEVEL_CONVERSATION_PROVIDER_ID ?? null,
		});

		// Link the subaccount to this GHL location (keeps provisioningSource as-is).
		await updateSubaccount(subaccount.organizationId, subaccount.id, {
			ghlLocationId: tokens.locationId,
		});

		return { success: true, locationId: tokens.locationId };
	});
