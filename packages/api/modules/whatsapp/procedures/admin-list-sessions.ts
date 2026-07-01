import { listAllWhatsAppSessions } from "@repo/database";

import { adminProcedure } from "../../../orpc/procedures";

export const adminListSessions = adminProcedure
	.route({
		method: "GET",
		path: "/whatsapp/admin/sessions",
		tags: ["WhatsApp"],
		summary: "List all WhatsApp sessions (admin)",
		description: "Cross-tenant list of every organization's WhatsApp sessions. Admin only.",
	})
	.handler(async () => {
		return listAllWhatsAppSessions();
	});
