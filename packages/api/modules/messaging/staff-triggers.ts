import { resolveCrmProvider } from "@repo/crm";
import { getConversation, getWhatsAppSettings } from "@repo/database";
import { logger } from "@repo/logs";

import { parseStaffTriggers } from "../whatsapp/types";

/**
 * Staff triggers: when an outbound message body contains a configured phrase
 * (case-sensitive "contains"), add the phrase's tag to the thread's CRM contact.
 * Best-effort — never throws (any failure just logs), so it can't break a send.
 */
export async function applyStaffTriggers(
	subaccountId: string,
	chatId: string,
	body: string | null | undefined,
): Promise<void> {
	try {
		if (!body) {
			return;
		}
		const settings = await getWhatsAppSettings(subaccountId);
		const triggers = parseStaffTriggers(settings?.staffTriggers);
		if (triggers.length === 0) {
			return;
		}
		const tags = [...new Set(triggers.filter((t) => body.includes(t.phrase)).map((t) => t.tag))];
		if (tags.length === 0) {
			return;
		}
		const conversation = await getConversation(subaccountId, chatId);
		if (!conversation?.ghlContactId) {
			return;
		}
		const provider = await resolveCrmProvider(subaccountId);
		await provider?.addContactTags(conversation.ghlContactId, tags);
	} catch (error) {
		logger.warn(error, { ctx: "messaging.staffTriggers", chatId });
	}
}
