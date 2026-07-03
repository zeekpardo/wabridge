import { getConversation, getDefaultSession, getWhatsAppSession } from "@repo/database";

type WhatsAppSession = NonNullable<Awaited<ReturnType<typeof getWhatsAppSession>>>;

/**
 * Resolve which number acts on a chat, mirroring send-message's fallback: the
 * conversation's pinned active number, else the subaccount's default. Null when
 * no sendable number exists.
 */
export async function resolveSendingSession(
	subaccountId: string,
	chatId: string,
): Promise<WhatsAppSession | null> {
	const conversation = await getConversation(subaccountId, chatId);
	if (conversation?.activeSessionId) {
		const active = await getWhatsAppSession(subaccountId, conversation.activeSessionId);
		if (active) {
			return active;
		}
	}
	return getDefaultSession(subaccountId);
}
