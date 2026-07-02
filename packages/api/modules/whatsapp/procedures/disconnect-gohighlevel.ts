import { ORPCError } from "@orpc/server";
import {
	clearConversationGhlLinks,
	deleteGhlConnection,
	getGhlConnection,
	getSubaccountById,
	updateSubaccount,
} from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { verifyOrganizationMembership } from "../../organizations/lib/membership";

/**
 * Disconnect a subaccount from GoHighLevel: drop the stored connection
 * (tokens), unlink the GHL location, and clear every conversation's cached
 * GHL contact/conversation ids so a later connect — possibly to a different
 * location — re-resolves them instead of posting against stale ids.
 *
 * Local data is untouched: WhatsApp numbers, conversations, and messages keep
 * working standalone. Requires agency membership (the embedded SSO context
 * cannot disconnect).
 */
export const disconnectGoHighLevel = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/ghl/disconnect",
		tags: ["WhatsApp"],
		summary: "Disconnect a subaccount from GoHighLevel",
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

		const connection = await getGhlConnection(subaccount.id);
		if (!connection) {
			// Nothing to disconnect — treat as success so the UI settles.
			return { ok: true, disconnected: false };
		}

		await deleteGhlConnection(subaccount.id);
		await clearConversationGhlLinks(subaccount.id);
		await updateSubaccount(subaccount.organizationId, subaccount.id, { ghlLocationId: null });

		return { ok: true, disconnected: true };
	});
