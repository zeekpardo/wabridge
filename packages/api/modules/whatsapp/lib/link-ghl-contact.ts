import { getGhlConnection, setConversationGhlLink } from "@repo/database";
import { createGoHighLevelClient, ghlContactDisplayName } from "@repo/integrations";
import { logger } from "@repo/logs";

export interface LinkThreadByPhoneInput {
	subaccountId: string;
	organizationId: string;
	/** The WhatsApp chat id of the thread to link (e.g. an `@lid` chat). */
	chatId: string;
	/** The contact's real phone (E.164-ish; `+` and separators are tolerated). */
	phone: string;
}

/**
 * Match (upsert) the GHL contact by phone and cache the contact/conversation
 * link on the local thread — the same resolve/upsert-by-phone path the fan-out
 * uses, but keyed on an explicit phone rather than a message. Lets the contact
 * panel link a WhatsApp-privacy (`@lid`) thread whose LID never resolved to a
 * phone on its own. Best-effort: returns the GHL contact id, or null when GHL
 * isn't connected / the phone is unusable / GHL is unreachable.
 */
export async function linkThreadToGhlByPhone(
	input: LinkThreadByPhoneInput,
): Promise<string | null> {
	const digits = input.phone.replace(/\D/g, "");
	if (digits.length < 6) {
		return null;
	}
	try {
		const [client, connection] = await Promise.all([
			createGoHighLevelClient(input.subaccountId),
			getGhlConnection(input.subaccountId),
		]);
		if (!client || !connection) {
			return null;
		}
		const contact = await client.upsertContact({
			phone: `+${digits}`,
			locationId: connection.locationId,
			source: "WABridge",
		});
		const conversation = await client.getOrCreateConversation({
			locationId: connection.locationId,
			contactId: contact.id,
		});
		await setConversationGhlLink({
			subaccountId: input.subaccountId,
			organizationId: input.organizationId,
			chatId: input.chatId,
			ghlContactId: contact.id,
			ghlConversationId: conversation.id,
			contactName: ghlContactDisplayName(contact),
		});
		return contact.id;
	} catch (error) {
		logger.error(error, { ctx: "whatsapp.linkThreadToGhlByPhone", chatId: input.chatId });
		return null;
	}
}
