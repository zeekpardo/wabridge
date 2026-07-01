import { getConversation, setConversationTags } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

function currentTags(tags: unknown): string[] {
	return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

/**
 * Add or remove a single contact tag (read-modify-write). Prewired for GHL:
 * tags live on the conversation now, ready to sync to the contact once a
 * GoHighLevel connection exists.
 */
export const setContactTags = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-tags",
		tags: ["WhatsApp"],
		summary: "Add or remove a contact tag",
	})
	.input(
		z.object({
			chatId: z.string(),
			tag: z.string().min(1).max(64),
			action: z.enum(["add", "remove"]),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }): Promise<{ tags: string[] }> => {
		const subaccount = await resolveSubaccount(
			session.activeOrganizationId,
			user.id,
			input.subaccountId,
		);

		const conversation = await getConversation(subaccount.id, input.chatId);
		const existing = currentTags(conversation?.tags);
		const tag = input.tag.trim();

		const next =
			input.action === "add"
				? [...existing, tag]
				: existing.filter((value) => value.toLowerCase() !== tag.toLowerCase());

		const updated = await setConversationTags({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			tags: next,
		});
		return { tags: currentTags(updated.tags) };
	});
