import { getConversation, setConversationContactName } from "@repo/database";
import { createGoHighLevelClient, ghlContactDisplayName } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * Edit a contact's basic fields from the details panel. When the thread is
 * linked to a GHL contact the edit writes through to GHL (which is the source
 * of truth when linked) and the refreshed display name is cached locally.
 * Standalone threads keep the name locally; email has no local home yet.
 */
export const setContactFields = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-fields",
		tags: ["WhatsApp"],
		summary: "Update a contact's name/email",
	})
	.input(
		z
			.object({
				chatId: z.string(),
				firstName: z.string().max(100).optional(),
				lastName: z.string().max(100).optional(),
				email: z.string().max(200).optional(),
				subaccountId: z.string().optional(),
			})
			.refine(
				(value) =>
					value.firstName !== undefined ||
					value.lastName !== undefined ||
					value.email !== undefined,
				{ message: "Provide at least one field to update." },
			),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const conversation = await getConversation(subaccount.id, input.chatId);

		if (conversation?.ghlContactId) {
			const client = await createGoHighLevelClient(subaccount.id);
			if (client) {
				await client.updateContact(conversation.ghlContactId, {
					...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
					...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
					...(input.email !== undefined ? { email: input.email } : {}),
				});
				// Re-read for the merged truth and cache the display name locally.
				try {
					const contact = await client.getContact(conversation.ghlContactId);
					const name = ghlContactDisplayName(contact);
					if (name) {
						await setConversationContactName({
							subaccountId: subaccount.id,
							chatId: input.chatId,
							contactName: name,
						});
					}
				} catch (error) {
					logger.warn("Contact refresh after field update failed", {
						ctx: "whatsapp.contactFields",
						error: error instanceof Error ? error.message : String(error),
					});
				}
				return { ok: true };
			}
		}

		// Standalone: names live on the conversation; email has nowhere to go yet.
		const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
		if (name) {
			await setConversationContactName({
				subaccountId: subaccount.id,
				chatId: input.chatId,
				contactName: name,
			});
		}
		if (input.email !== undefined) {
			logger.info("Email edit on an unlinked thread has no local store; ignored", {
				ctx: "whatsapp.contactFields",
				chatId: input.chatId,
			});
		}
		return { ok: true };
	});
