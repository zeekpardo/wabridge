import { ORPCError } from "@orpc/server";
import {
	getConversation,
	getGhlConnection,
	getWhatsAppSession,
	setConversationActiveSession,
} from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { syncPrimaryNumberTag } from "../../ghl/sync-primary-number-tag";
import { resolveSubaccount } from "../lib/active-organization";

export const setConversationNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/conversations/active-number",
		tags: ["WhatsApp"],
		summary: "Set a conversation's active number",
		description: "Persist which of the org's numbers replies to a contact (the UI 'Send from').",
	})
	.input(
		z.object({
			chatId: z.string(),
			sessionId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const target = await getWhatsAppSession(subaccount.id, input.sessionId);
		if (!target) {
			throw new ORPCError("NOT_FOUND", { message: "Number not found for this subaccount." });
		}

		const result = await setConversationActiveSession({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			sessionId: input.sessionId,
		});

		// Mark the newly-picked number as the contact's primary via a `wa:` tag on
		// the linked GHL contact. Best-effort — a GHL hiccup never fails the pick.
		const ghl = await getGhlConnection(subaccount.id);
		if (ghl && target.phone) {
			const conversation = await getConversation(subaccount.id, input.chatId);
			if (conversation?.ghlContactId) {
				const client = await createGoHighLevelClient(subaccount.id);
				if (client) {
					await syncPrimaryNumberTag(client, conversation.ghlContactId, target.phone);
				}
			}
		}

		return result;
	});
