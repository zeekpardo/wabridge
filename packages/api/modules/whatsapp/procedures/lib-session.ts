import { getConversation, getDefaultSession, getWhatsAppSession } from "@repo/database";

type WhatsAppSession = NonNullable<Awaited<ReturnType<typeof getWhatsAppSession>>>;

/**
 * Resolve which number acts on a chat, mirroring send-message's fallback: the
 * conversation's pinned active number, else the subaccount's default. Null when
 * no sendable number exists.
 *
 * GROUP chats (`@g.us`) are the exception: a group is tied to the one of our
 * numbers that is a member of it (pinned as the active session by the inbound
 * group message). We must act from that number and NEVER fall back to the
 * default — a non-member number can't act on the group. Returns null when no
 * member number is known for the group.
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
	if (chatId.endsWith("@g.us")) {
		return null;
	}
	return getDefaultSession(subaccountId);
}
