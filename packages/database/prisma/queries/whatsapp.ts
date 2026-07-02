import { db } from "../client";

// ─── WhatsApp Session ─────────────────────────────────────────────────────────

export async function createWhatsAppSession(data: {
	subaccountId: string;
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
	priority?: number;
}) {
	return db.whatsAppSession.create({
		data: {
			subaccountId: data.subaccountId,
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
			priority: data.priority ?? 0,
		},
	});
}

export async function countWhatsAppSessions(subaccountId: string) {
	return db.whatsAppSession.count({ where: { subaccountId } });
}

/** The subaccount's number at a given send priority (for #switch|N). */
export async function getSessionByPriority(subaccountId: string, priority: number) {
	return db.whatsAppSession.findFirst({ where: { subaccountId, priority } });
}

/** Ready numbers for a subaccount, ordered by send priority (for dropdowns + default). */
export async function listSendableSessions(subaccountId: string) {
	return db.whatsAppSession.findMany({
		where: { subaccountId, status: "ready" },
		orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
	});
}

/** The default sender: the highest-priority ready number. */
export async function getDefaultSession(subaccountId: string) {
	return db.whatsAppSession.findFirst({
		where: { subaccountId, status: "ready" },
		orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
	});
}

export async function getWhatsAppSession(subaccountId: string, id: string) {
	return db.whatsAppSession.findFirst({
		where: { id, subaccountId },
	});
}

export async function getWhatsAppSessionByOpenwaSessionId(openwaSessionId: string) {
	return db.whatsAppSession.findUnique({
		where: { openwaSessionId },
	});
}

export async function listWhatsAppSessions(subaccountId: string) {
	return db.whatsAppSession.findMany({
		where: { subaccountId },
		orderBy: { createdAt: "desc" },
	});
}

export async function updateWhatsAppSession(
	subaccountId: string,
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
		where: { id, subaccountId },
		data,
	});

	if (result.count === 0) {
		return null;
	}

	return getWhatsAppSession(subaccountId, id);
}

export async function deleteWhatsAppSession(subaccountId: string, id: string) {
	const result = await db.whatsAppSession.deleteMany({
		where: { id, subaccountId },
	});

	return result.count > 0;
}

// ─── WhatsApp Conversations (one thread per contact, per subaccount) ──────────

const activeSessionSelect = {
	select: { id: true, label: true, phone: true, priority: true, status: true },
} as const;

export async function getConversation(subaccountId: string, chatId: string) {
	return db.whatsAppConversation.findUnique({
		where: { subaccountId_chatId: { subaccountId, chatId } },
		include: { activeSession: activeSessionSelect },
	});
}

export async function listConversations(subaccountId: string) {
	return db.whatsAppConversation.findMany({
		where: { subaccountId },
		orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
		include: { activeSession: activeSessionSelect },
	});
}

/** Inbound arrival: upsert the thread and reply-lock it to the receiving number. */
export async function upsertConversationInbound(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	sessionId: string;
	preview: string;
	contactName?: string | null;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			activeSessionId: data.sessionId,
			contactName: data.contactName ?? undefined,
			lastMessageAt: new Date(),
			lastMessagePreview: data.preview,
			lastDirection: "inbound",
			unreadCount: 1,
		},
		update: {
			activeSessionId: data.sessionId,
			...(data.contactName ? { contactName: data.contactName } : {}),
			lastMessageAt: new Date(),
			lastMessagePreview: data.preview,
			lastDirection: "inbound",
			unreadCount: { increment: 1 },
		},
	});
}

/** Outbound send: refresh the thread and persist the sending number as active. */
export async function touchConversationOutbound(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	sessionId: string;
	preview: string;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			activeSessionId: data.sessionId,
			lastMessageAt: new Date(),
			lastMessagePreview: data.preview,
			lastDirection: "outbound",
			unreadCount: 0,
		},
		update: {
			activeSessionId: data.sessionId,
			lastMessageAt: new Date(),
			lastMessagePreview: data.preview,
			lastDirection: "outbound",
		},
	});
}

/**
 * Cache the GHL contact/conversation ids for a thread so message projections
 * skip the upsert/search round-trips after the first message. Upserts because
 * the projection can run before the thread row exists (first inbound message).
 */
export async function setConversationGhlLink(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	ghlContactId: string;
	ghlConversationId?: string | null;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			ghlContactId: data.ghlContactId,
			ghlConversationId: data.ghlConversationId ?? undefined,
		},
		update: {
			ghlContactId: data.ghlContactId,
			...(data.ghlConversationId ? { ghlConversationId: data.ghlConversationId } : {}),
		},
	});
}

/**
 * Drop every conversation's cached GHL ids for a subaccount — run on GHL
 * disconnect so a later connect (possibly to a different location) re-resolves
 * contacts/conversations instead of posting against stale ids.
 */
export async function clearConversationGhlLinks(subaccountId: string) {
	return db.whatsAppConversation.updateMany({
		where: { subaccountId },
		data: { ghlContactId: null, ghlConversationId: null },
	});
}

/** Persist the active/sending number for a conversation (dropdown or #switch). */
export async function setConversationActiveSession(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	sessionId: string;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			activeSessionId: data.sessionId,
		},
		update: { activeSessionId: data.sessionId },
	});
}

/**
 * Set the contact owner for a conversation. Upserts so a never-messaged contact
 * (present only as an OpenWA chat) can still be assigned an owner.
 */
export async function setConversationOwner(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	ownerId: string | null;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			ownerId: data.ownerId,
		},
		update: { ownerId: data.ownerId },
	});
}

/** Overwrite a conversation's contact tags (deduped, order preserved). */
export async function setConversationTags(data: {
	subaccountId: string;
	organizationId: string;
	chatId: string;
	tags: string[];
}) {
	const unique = [...new Set(data.tags.map((tag) => tag.trim()).filter(Boolean))];
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			tags: unique,
		},
		update: { tags: unique },
	});
}

/** Agency members with their user profile — powers the owner dropdown. */
export async function listOrganizationMembers(organizationId: string) {
	return db.member.findMany({
		where: { organizationId },
		orderBy: { createdAt: "asc" },
		select: {
			userId: true,
			role: true,
			user: { select: { id: true, name: true, email: true, image: true } },
		},
	});
}

export async function markConversationRead(subaccountId: string, chatId: string) {
	return db.whatsAppConversation.updateMany({
		where: { subaccountId, chatId },
		data: { unreadCount: 0 },
	});
}

/** Thread messages for a contact (oldest first), capped to the last `limit`. */
export async function listThreadMessages(subaccountId: string, chatId: string, limit = 50) {
	const rows = await db.whatsAppMessage.findMany({
		where: { subaccountId, chatId },
		orderBy: { timestamp: "desc" },
		take: limit,
	});
	return rows.reverse();
}

// ─── WhatsApp Settings (per subaccount) ───────────────────────────────────────

export async function getWhatsAppSettings(subaccountId: string) {
	return db.whatsAppSettings.findUnique({ where: { subaccountId } });
}

export async function upsertWhatsAppSettings(
	subaccountId: string,
	data: { globalSpintax?: unknown },
) {
	return db.whatsAppSettings.upsert({
		where: { subaccountId },
		create: { subaccountId, globalSpintax: data.globalSpintax ?? undefined },
		update: { globalSpintax: data.globalSpintax ?? undefined },
	});
}

/**
 * Cross-tenant listing for operator/admin surfaces and the reconciler. NOT
 * scoped — callers must be admin/system. Includes the owning subaccount + org.
 */
export async function listAllWhatsAppSessions() {
	return db.whatsAppSession.findMany({
		orderBy: { createdAt: "desc" },
		include: {
			organization: { select: { id: true, slug: true, name: true } },
			subaccount: { select: { id: true, name: true } },
		},
	});
}

// ─── WhatsApp Message ─────────────────────────────────────────────────────────

export async function createWhatsAppMessage(data: {
	subaccountId: string;
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
	/** Where this message entered the hub: "contact" | "ghl" | "app". */
	origin?: string;
	/** GHL's message id once mirrored (for status updates + echo de-dupe). */
	ghlMessageId?: string | null;
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
			subaccountId: data.subaccountId,
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
			origin: data.origin ?? "contact",
			ghlMessageId: data.ghlMessageId ?? null,
		},
	});
}

/** Look up a stored message by the GHL message id (echo de-dupe + status). */
export async function getMessageByGhlMessageId(subaccountId: string, ghlMessageId: string) {
	return db.whatsAppMessage.findFirst({ where: { subaccountId, ghlMessageId } });
}

/** Look up a stored message by its WhatsApp id within a subaccount. */
export async function getMessageByWaMessageId(subaccountId: string, waMessageId: string) {
	return db.whatsAppMessage.findFirst({ where: { subaccountId, waMessageId } });
}

/** Record that a stored message was mirrored to GHL (maps our row ↔ GHL id). */
export async function markMessageGhlSynced(id: string, ghlMessageId: string | null) {
	return db.whatsAppMessage.update({
		where: { id },
		data: { ghlSynced: true, ghlMessageId },
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
	subaccountId: string,
	sessionId: string,
	limit = 50,
) {
	return db.whatsAppMessage.findMany({
		where: { sessionId, subaccountId },
		orderBy: { timestamp: "desc" },
		take: limit,
	});
}
