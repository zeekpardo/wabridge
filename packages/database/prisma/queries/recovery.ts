import { db } from "../client";
import type { Prisma } from "../generated/client";

// ─── Recovery (failed GHL outbounds, for the Recovery tab) ────────────────────

export interface RecordRecoveryInput {
	organizationId: string;
	subaccountId: string;
	sessionId?: string | null;
	chatId: string;
	phone?: string | null;
	ghlContactId?: string | null;
	ghlConversationId?: string | null;
	ghlMessageId?: string | null;
	body?: string | null;
	type?: string;
	attachments?: string[];
	reason: string;
}

/**
 * Capture a failed GHL outbound for later resend. Idempotent on
 * (subaccountId, ghlMessageId): GHL retrying the same undelivered message
 * refreshes the captured payload but never resurrects a row the rep already
 * recovered or dismissed. Messages with no ghlMessageId always insert.
 */
export async function recordRecoveryMessage(data: RecordRecoveryInput) {
	const attachments =
		data.attachments && data.attachments.length > 0
			? (data.attachments as Prisma.InputJsonValue)
			: undefined;
	const base = {
		organizationId: data.organizationId,
		subaccountId: data.subaccountId,
		sessionId: data.sessionId ?? null,
		chatId: data.chatId,
		phone: data.phone ?? null,
		ghlContactId: data.ghlContactId ?? null,
		ghlConversationId: data.ghlConversationId ?? null,
		ghlMessageId: data.ghlMessageId ?? null,
		body: data.body ?? null,
		type: data.type ?? "text",
		attachments,
		reason: data.reason,
	};

	if (data.ghlMessageId) {
		return db.recoveryMessage.upsert({
			where: {
				subaccountId_ghlMessageId: {
					subaccountId: data.subaccountId,
					ghlMessageId: data.ghlMessageId,
				},
			},
			create: base,
			// Refresh the payload/reason but leave status/attempts alone.
			update: {
				sessionId: base.sessionId,
				chatId: base.chatId,
				phone: base.phone,
				ghlContactId: base.ghlContactId,
				ghlConversationId: base.ghlConversationId,
				body: base.body,
				type: base.type,
				attachments,
				reason: base.reason,
			},
		});
	}

	return db.recoveryMessage.create({ data: base });
}

/** Failed sends for a subaccount, newest first (defaults to the pending queue). */
export async function listRecoveryMessages(subaccountId: string, status = "pending") {
	return db.recoveryMessage.findMany({
		where: { subaccountId, status },
		orderBy: { createdAt: "desc" },
	});
}

/** Count of a subaccount's recovery rows in a status (for the tab badge). */
export async function countRecoveryMessages(subaccountId: string, status = "pending") {
	return db.recoveryMessage.count({ where: { subaccountId, status } });
}

/** A single recovery row, scoped to its subaccount. */
export async function getRecoveryMessage(subaccountId: string, id: string) {
	return db.recoveryMessage.findFirst({ where: { id, subaccountId } });
}

/** Mark a recovery row delivered after a successful resend. */
export async function markRecoveryRecovered(
	subaccountId: string,
	id: string,
	waMessageId: string | null,
	recoveredAt: Date,
) {
	return db.recoveryMessage.updateMany({
		where: { id, subaccountId },
		data: {
			status: "recovered",
			waMessageId,
			recoveredAt,
			lastAttemptAt: recoveredAt,
			lastError: null,
			attempts: { increment: 1 },
		},
	});
}

/** Record a failed resend attempt (row stays pending). */
export async function bumpRecoveryAttempt(
	subaccountId: string,
	id: string,
	lastError: string,
	lastAttemptAt: Date,
) {
	return db.recoveryMessage.updateMany({
		where: { id, subaccountId },
		data: { attempts: { increment: 1 }, lastAttemptAt, lastError },
	});
}

/** Clear a recovery row without sending (rep decided not to resend). */
export async function dismissRecoveryMessage(subaccountId: string, id: string) {
	return db.recoveryMessage.updateMany({
		where: { id, subaccountId },
		data: { status: "dismissed" },
	});
}
