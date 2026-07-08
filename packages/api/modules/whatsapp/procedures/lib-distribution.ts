import { countConversationsBySession, listSendableSessions } from "@repo/database";

type WhatsAppSession = Awaited<ReturnType<typeof listSendableSessions>>[number];

/**
 * "Evenly distributed" number pick: the subaccount's ready number that currently owns the FEWEST
 * contacts, so new contacts spread evenly across numbers (and, incidentally, no single number carries
 * all the send volume — the load pattern WhatsApp flags). Least-loaded is self-correcting: it stays
 * even as contacts come and go, unlike a stored round-robin cursor.
 *
 * Ties break toward the higher-priority number (listSendableSessions is ordered priority-then-age, and
 * we keep the first seen on an equal count). Returns null when the subaccount has no ready number.
 */
export async function pickDistributedSession(subaccountId: string): Promise<WhatsAppSession | null> {
	const [sessions, counts] = await Promise.all([
		listSendableSessions(subaccountId),
		countConversationsBySession(subaccountId),
	]);
	if (sessions.length === 0) {
		return null;
	}

	let best: WhatsAppSession | null = null;
	let bestCount = Number.POSITIVE_INFINITY;
	for (const session of sessions) {
		const count = counts.get(session.id) ?? 0;
		if (count < bestCount) {
			best = session;
			bestCount = count;
		}
	}
	return best;
}
