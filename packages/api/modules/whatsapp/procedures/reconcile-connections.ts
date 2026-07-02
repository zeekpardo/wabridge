import { listWhatsAppSessions } from "@repo/database";
import { reconcileWhatsAppSessions } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * Reconcile the resolved subaccount's WhatsApp sessions against OpenWA and
 * return their refreshed state. Unlike the admin-wide `reconcileSessions`, this
 * is subaccount-scoped so the embedded Custom Page can offer a self-service
 * "Reconnect" — OpenWA drops sessions to disconnected on restart, and this
 * re-starts them from persisted creds (no QR in the common case).
 */
export const reconcileConnections = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/reconnect",
		tags: ["WhatsApp"],
		summary: "Reconnect this subaccount's WhatsApp numbers",
		description:
			"Re-starts any of the subaccount's sessions that OpenWA dropped (e.g. after a worker restart) and returns the refreshed sessions.",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const summary = await reconcileWhatsAppSessions(subaccount.id);
		const sessions = await listWhatsAppSessions(subaccount.id);
		return { summary, sessions };
	});
