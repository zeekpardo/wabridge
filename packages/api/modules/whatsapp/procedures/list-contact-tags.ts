import { resolveCrmProvider } from "@repo/crm";
import { getGhlConnection, listConversations } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * The tag options for the contact panel's picker. GHL-connected subaccounts
 * get the location's tag library (mirroring GHL's own tag dropdown);
 * standalone subaccounts get the distinct tags already used across their
 * threads. Falls back to local tags when the GHL fetch fails.
 */
export const listContactTags = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/contact-tags/options",
		tags: ["WhatsApp"],
		summary: "List available contact tags",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<string[]> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const ghl = await getGhlConnection(subaccount.id);
		if (ghl) {
			try {
				const provider = await resolveCrmProvider(subaccount.id);
				if (provider) {
					return await provider.listTags();
				}
			} catch (error) {
				logger.warn("GHL tag library fetch failed; falling back to local tags", {
					ctx: "whatsapp.contactTags",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const conversations = await listConversations(subaccount.id);
		const seen = new Set<string>();
		for (const conversation of conversations) {
			if (Array.isArray(conversation.tags)) {
				for (const tag of conversation.tags) {
					if (typeof tag === "string" && tag.trim()) {
						seen.add(tag);
					}
				}
			}
		}
		return [...seen].sort((a, b) => a.localeCompare(b));
	});
