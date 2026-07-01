import { reconcileWhatsAppSessions } from "@repo/whatsapp";

import { adminProcedure } from "../../../orpc/procedures";

export const reconcileSessions = adminProcedure
	.route({
		method: "POST",
		path: "/whatsapp/admin/reconcile",
		tags: ["WhatsApp"],
		summary: "Reconcile WhatsApp sessions (admin)",
		description:
			"Re-start any tracked sessions the OpenWA worker has dropped (e.g. after a worker reboot). Admin only.",
	})
	.handler(async () => {
		return reconcileWhatsAppSessions();
	});
