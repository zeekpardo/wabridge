import { db } from "../client";

// ─── WhatsApp Session ─────────────────────────────────────────────────────────

export async function createWhatsAppSession(data: {
	organizationId: string;
	openwaSessionId: string;
	openwaName: string;
	workerBaseUrl: string;
	status: string;
	webhookSecret: string;
	label?: string | null;
	phone?: string | null;
	jid?: string | null;
	needsQr?: boolean;
}) {
	return db.whatsAppSession.create({
		data: {
			organizationId: data.organizationId,
			openwaSessionId: data.openwaSessionId,
			openwaName: data.openwaName,
			workerBaseUrl: data.workerBaseUrl,
			status: data.status,
			webhookSecret: data.webhookSecret,
			label: data.label,
			phone: data.phone,
			jid: data.jid,
			needsQr: data.needsQr ?? true,
		},
	});
}

export async function getWhatsAppSession(organizationId: string, id: string) {
	return db.whatsAppSession.findFirst({
		where: { id, organizationId },
	});
}

export async function getWhatsAppSessionByOpenwaSessionId(openwaSessionId: string) {
	return db.whatsAppSession.findUnique({
		where: { openwaSessionId },
	});
}

export async function listWhatsAppSessions(organizationId: string) {
	return db.whatsAppSession.findMany({
		where: { organizationId },
		orderBy: { createdAt: "desc" },
	});
}

export async function updateWhatsAppSession(
	organizationId: string,
	id: string,
	data: Partial<{
		status: string;
		label: string | null;
		phone: string | null;
		jid: string | null;
		needsQr: boolean;
		lastError: string | null;
		connectedAt: Date | null;
	}>,
) {
	const result = await db.whatsAppSession.updateMany({
		where: { id, organizationId },
		data,
	});

	if (result.count === 0) {
		return null;
	}

	return getWhatsAppSession(organizationId, id);
}

export async function deleteWhatsAppSession(organizationId: string, id: string) {
	const result = await db.whatsAppSession.deleteMany({
		where: { id, organizationId },
	});

	return result.count > 0;
}

// ─── WhatsApp Settings (per org) ──────────────────────────────────────────────

export async function getWhatsAppSettings(organizationId: string) {
	return db.whatsAppSettings.findUnique({ where: { organizationId } });
}

export async function upsertWhatsAppSettings(
	organizationId: string,
	data: { globalSpintax?: unknown },
) {
	return db.whatsAppSettings.upsert({
		where: { organizationId },
		create: { organizationId, globalSpintax: data.globalSpintax ?? undefined },
		update: { globalSpintax: data.globalSpintax ?? undefined },
	});
}

/**
 * Cross-tenant listing for operator/admin surfaces and the reconciler. NOT
 * org-scoped — callers must be admin/system. Includes the owning organization.
 */
export async function listAllWhatsAppSessions() {
	return db.whatsAppSession.findMany({
		orderBy: { createdAt: "desc" },
		include: { organization: { select: { id: true, slug: true, name: true } } },
	});
}

// ─── WhatsApp Message ─────────────────────────────────────────────────────────

export async function createWhatsAppMessage(data: {
	organizationId: string;
	sessionId: string;
	direction: string;
	chatId: string;
	fromMe: boolean;
	type: string;
	timestamp: Date;
	waMessageId?: string | null;
	body?: string | null;
	status?: string | null;
	idempotencyKey?: string | null;
}) {
	// Idempotent on `idempotencyKey`: when a key is provided and already stored,
	// return the existing row instead of inserting a duplicate.
	if (data.idempotencyKey) {
		const existing = await db.whatsAppMessage.findUnique({
			where: { idempotencyKey: data.idempotencyKey },
		});

		if (existing) {
			return existing;
		}
	}

	// Also dedup on the WhatsApp message id within a session: an outbound message
	// stored at API-send time and its later `message.sent` webhook echo share a
	// waMessageId and must collapse to a single row.
	if (data.waMessageId) {
		const existing = await db.whatsAppMessage.findFirst({
			where: { sessionId: data.sessionId, waMessageId: data.waMessageId },
		});

		if (existing) {
			return existing;
		}
	}

	return db.whatsAppMessage.create({
		data: {
			organizationId: data.organizationId,
			sessionId: data.sessionId,
			direction: data.direction,
			chatId: data.chatId,
			fromMe: data.fromMe,
			type: data.type,
			timestamp: data.timestamp,
			waMessageId: data.waMessageId,
			body: data.body,
			status: data.status,
			idempotencyKey: data.idempotencyKey,
		},
	});
}

/**
 * Update the delivery status of a stored message by its WhatsApp id (from a
 * `message.ack` receipt). No-op if the message isn't tracked in this session.
 */
export async function updateWhatsAppMessageStatus(
	sessionId: string,
	waMessageId: string,
	status: string,
) {
	return db.whatsAppMessage.updateMany({
		where: { sessionId, waMessageId },
		data: { status },
	});
}

export async function listWhatsAppMessagesBySession(
	organizationId: string,
	sessionId: string,
	limit = 50,
) {
	return db.whatsAppMessage.findMany({
		where: { sessionId, organizationId },
		orderBy: { timestamp: "desc" },
		take: limit,
	});
}
