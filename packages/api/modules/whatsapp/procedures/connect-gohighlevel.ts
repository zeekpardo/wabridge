import { ORPCError } from "@orpc/server";
import {
	countSubaccounts,
	createSubaccount,
	getSubaccountByLocationId,
	getSubaccountById,
	updateSubaccount,
	upsertGhlConnection,
} from "@repo/database";
import { encrypt, exchangeGhlCode } from "@repo/integrations";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { syncSubaccountNameFromGhl } from "../../ghl/sync-subaccount-name";
import { verifyOrganizationMembership } from "../../organizations/lib/membership";
import { requireAgencyId } from "../../subaccounts/lib/agency";
import { getSubaccountLimit } from "../../subaccounts/lib/plan-limits";

/**
 * Exchange the GoHighLevel OAuth code (from the install callback page) and store
 * the connection. Two modes, by whether `subaccountId` is present in the state:
 *
 * - **Connect** (subaccountId given): link an existing subaccount to the GHL
 *   location. Used by the per-subaccount "Connect GoHighLevel" button.
 * - **Provision** (no subaccountId): find-or-create a `ghl`-sourced subaccount for
 *   the location and link it. Used by the Control Panel "Connect GoHighLevel" add
 *   flow, where no subaccount exists yet.
 *
 * Either way the subaccount name is (re)synced from the GHL location — GHL owns
 * the name for linked subaccounts.
 */
export const connectGoHighLevel = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/ghl/connect",
		tags: ["WhatsApp"],
		summary: "Exchange the GHL OAuth code and store the connection",
	})
	.input(z.object({ subaccountId: z.string().optional(), code: z.string() }))
	.handler(async ({ input, context: { user, session } }) => {
		const tokens = await exchangeGhlCode(input.code);
		if (!tokens.locationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No location returned from GoHighLevel — pick a location during install.",
			});
		}
		const locationId = tokens.locationId;

		// Resolve the target subaccount: the one carried in state, an existing one
		// already mapped to this location, or a freshly provisioned `ghl` account.
		let subaccountId: string;
		let organizationId: string;
		if (input.subaccountId) {
			const subaccount = await getSubaccountById(input.subaccountId);
			if (!subaccount) {
				throw new ORPCError("NOT_FOUND", { message: "Subaccount not found." });
			}
			if (!(await verifyOrganizationMembership(subaccount.organizationId, user.id))) {
				throw new ORPCError("FORBIDDEN");
			}
			subaccountId = subaccount.id;
			organizationId = subaccount.organizationId;
		} else {
			organizationId = await requireAgencyId(session.activeOrganizationId, user.id);
			const linked = await getSubaccountByLocationId(locationId);
			if (linked && linked.organizationId === organizationId) {
				subaccountId = linked.id;
			} else {
				// Provisioning a NEW subaccount counts against the plan's quota, same as
				// a manual create — otherwise GHL connects would bypass the limit.
				const [used, limit] = await Promise.all([
					countSubaccounts(organizationId),
					getSubaccountLimit(organizationId),
				]);
				if (used >= limit) {
					throw new ORPCError("FORBIDDEN", {
						message: Number.isFinite(limit)
							? `Sub-account limit reached (${limit}). Upgrade your plan to connect more.`
							: "Sub-account limit reached.",
					});
				}
				const created = await createSubaccount({
					organizationId,
					// Placeholder — the name sync below adopts the real GHL location name.
					name: `GHL ${locationId}`,
					provisioningSource: "ghl",
					ghlLocationId: locationId,
				});
				subaccountId = created.id;
			}
		}

		await upsertGhlConnection({
			subaccountId,
			locationId,
			companyId: tokens.companyId ?? null,
			userId: tokens.userId ?? null,
			accessToken: encrypt(tokens.access_token),
			refreshToken: encrypt(tokens.refresh_token),
			tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
			conversationProviderId: process.env.GOHIGHLEVEL_CONVERSATION_PROVIDER_ID ?? null,
			// The SMS-replace (Option B) provider id from the marketplace app —
			// bookkeeping only; Option B API calls don't send a provider id.
			smsProviderId: process.env.GOHIGHLEVEL_SMS_PROVIDER_ID ?? null,
		});

		// Link + adopt the GHL location name (keeps provisioningSource as-is).
		await updateSubaccount(organizationId, subaccountId, { ghlLocationId: locationId });
		await syncSubaccountNameFromGhl(subaccountId);

		return { success: true, locationId, subaccountId };
	});
