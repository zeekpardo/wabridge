import { getWhatsAppSettings } from "@repo/database";
import type { GlobalSpintax } from "@repo/whatsapp";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/active-organization";

export const getSettings = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/settings",
		tags: ["WhatsApp"],
		summary: "Get WhatsApp settings",
		description: "Global spintax variables for the caller's active organization.",
	})
	.handler(async ({ context: { user, session } }) => {
		const organizationId = await requireActiveOrganizationId(
			session.activeOrganizationId,
			user.id,
		);

		const settings = await getWhatsAppSettings(organizationId);
		const globalSpintax = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		return { globalSpintax };
	});
