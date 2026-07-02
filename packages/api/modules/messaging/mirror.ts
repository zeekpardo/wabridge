import { logger } from "@repo/logs";
import type { SentMessage } from "@repo/whatsapp";

import { createFanOutDeps } from "./deps";

export interface MirrorTarget {
	subaccountId: string;
	organizationId: string;
	/** The sending WhatsAppSession row id. */
	sessionId: string;
	chatId: string;
}

/**
 * Record app-sent messages in the connected CRM's conversation timeline (the
 * hub's `recordGhlOutbound` projection). The command-aware send path executes
 * multiple actions itself, so it can't flow through `fanOutMessage` — this
 * applies the same projection + `ghlSynced` marking after the fact.
 *
 * Best-effort by design: a CRM outage or an unlinked thread never fails the
 * send (the projection itself is non-throwing; rows stay ghlSynced=false).
 */
export async function mirrorAppSendToCrm(
	target: MirrorTarget,
	messages: SentMessage[],
): Promise<void> {
	const deps = createFanOutDeps();

	for (const message of messages) {
		try {
			const res = await deps.recordGhlOutbound({
				subaccountId: target.subaccountId,
				organizationId: target.organizationId,
				sessionId: target.sessionId,
				chatId: target.chatId,
				direction: "outbound",
				origin: "app",
				body: message.body,
				type: message.type,
				waMessageId: message.waMessageId,
				timestamp: message.timestamp,
			});
			if (res?.ghlMessageId) {
				await deps.markSynced(message.id, res.ghlMessageId);
			}
		} catch (error) {
			logger.error(error, { ctx: "messaging.mirrorAppSend", chatId: target.chatId });
		}
	}
}
