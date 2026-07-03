import { resolveCrmProvider } from "@repo/crm";
import { getConversation, setConversationTags } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

function currentTags(tags: unknown): string[] {
	return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

/**
 * Add or remove a single contact tag (read-modify-write). Local-first; when
 * the thread is linked to a GHL contact the change also pushes to GHL — adds
 * via the idempotent tags endpoint, removals via a full-list contact update
 * (GHL has no remove-tag endpoint). Best-effort: a GHL hiccup keeps the local
 * change and logs (the panel's read-through reconciles on next load).
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
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

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

		// Push to the linked GHL contact (GHL is the tag source of truth when
		// linked, so keep it current with the app-side edit).
		if (conversation?.ghlContactId) {
			try {
				const provider = await resolveCrmProvider(subaccount.id);
				if (provider) {
					if (input.action === "add") {
						await provider.addContactTags(conversation.ghlContactId, [tag]);
					} else {
						await provider.setContactTags(conversation.ghlContactId, next);
					}
				}
			} catch (error) {
				logger.warn("GHL tag push failed", {
					ctx: "whatsapp.contactTags",
					ghlContactId: conversation.ghlContactId,
					action: input.action,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { tags: currentTags(updated.tags) };
	});
