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

/**
 * Explicitly set a contact's PRIMARY WhatsApp number — the durable "number we send from to this
 * contact", recorded as the `wa:<digits>` tag on the linked GHL contact. A manual, intentional action,
 * distinct from the transient "Send from" pick (setConversationNumber), which no longer touches the
 * primary. Setting the primary also makes it the active send-from for this conversation (the primary
 * is, by definition, the default number to reply from).
 */
export const setPrimaryNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/conversations/primary-number",
		tags: ["WhatsApp"],
		summary: "Set a conversation's primary number",
		description:
			"Explicitly mark which of the org's numbers is this contact's primary (the `wa:` tag we default to sending from). Manual — unlike the transient 'Send from' pick.",
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

		// The primary is the default we reply from — also set it as the conversation's active send-from.
		await setConversationActiveSession({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId: input.chatId,
			sessionId: input.sessionId,
		});

		// Record it as the primary on the linked GHL contact via the `wa:<digits>` tag. Best-effort — a
		// GHL hiccup never fails the action.
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

		return { ok: true, phone: target.phone ?? null };
	});
