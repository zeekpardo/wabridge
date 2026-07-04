import { db } from "../client";
import type { Prisma } from "../generated/client";

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

/**
 * Set a session's send priority, swapping with whatever session currently holds
 * the target priority so priorities stay unique within the subaccount (`#switch|N`
 * resolves by exact match). No-op when already at that priority. Returns null if
 * the session isn't in this subaccount.
 */
export async function setSessionPriority(subaccountId: string, id: string, priority: number) {
	return db.$transaction(async (tx) => {
		const target = await tx.whatsAppSession.findFirst({ where: { id, subaccountId } });
		if (!target) {
			return null;
		}
		if (target.priority === priority) {
			return target;
		}
		// Give the current holder of this priority the target's old slot (swap), so
		// the subaccount's priorities remain a set of unique values.
		const holder = await tx.whatsAppSession.findFirst({
			where: { subaccountId, priority, id: { not: id } },
		});
		if (holder) {
			await tx.whatsAppSession.update({
				where: { id: holder.id },
				data: { priority: target.priority },
			});
		}
		return tx.whatsAppSession.update({ where: { id }, data: { priority } });
	});
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

/**
 * Fetch just the conversations for a set of chat ids (e.g. a group's members as
 * `<phone>@c.us`) — used to overlay CRM name + link onto group participants
 * without loading every conversation in the subaccount.
 */
export async function getConversationsByChatIds(subaccountId: string, chatIds: string[]) {
	if (chatIds.length === 0) {
		return [];
	}
	return db.whatsAppConversation.findMany({
		where: { subaccountId, chatId: { in: chatIds } },
		select: { chatId: true, contactName: true, ghlContactId: true },
	});
}

/**
 * Inbound arrival: upsert the thread. The active/sending number is set once — on
 * create, or later via setConversationActiveSession — so subsequent inbound
 * messages never re-lock the reply number.
 */
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
			...(data.contactName ? { contactName: data.contactName } : {}),
			lastMessageAt: new Date(),
			lastMessagePreview: data.preview,
			lastDirection: "inbound",
			unreadCount: { increment: 1 },
		},
	});
}

/**
 * Outbound send: refresh the thread. The active/sending number is set once — on
 * create, or later via setConversationActiveSession — so an outbound send never
 * overwrites an already-chosen active number.
 */
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
	/** The CRM's name for the contact — overwrites local (GHL wins when linked). */
	contactName?: string | null;
	/**
	 * For a GROUP thread mirrored as a synthetic CRM contact: the placeholder phone
	 * we assigned it (enables CRM→WA reverse routing). Omit for 1:1 threads.
	 */
	crmPlaceholderPhone?: string | null;
}) {
	return db.whatsAppConversation.upsert({
		where: { subaccountId_chatId: { subaccountId: data.subaccountId, chatId: data.chatId } },
		create: {
			subaccountId: data.subaccountId,
			organizationId: data.organizationId,
			chatId: data.chatId,
			ghlContactId: data.ghlContactId,
			ghlConversationId: data.ghlConversationId ?? undefined,
			contactName: data.contactName ?? undefined,
			crmPlaceholderPhone: data.crmPlaceholderPhone ?? undefined,
		},
		update: {
			ghlContactId: data.ghlContactId,
			...(data.ghlConversationId ? { ghlConversationId: data.ghlConversationId } : {}),
			...(data.contactName ? { contactName: data.contactName } : {}),
			...(data.crmPlaceholderPhone ? { crmPlaceholderPhone: data.crmPlaceholderPhone } : {}),
		},
	});
}

/** The thread linked to a GHL contact, if any (webhook → conversation routing). */
export async function getConversationByGhlContactId(subaccountId: string, ghlContactId: string) {
	return db.whatsAppConversation.findFirst({ where: { subaccountId, ghlContactId } });
}

/**
 * The GROUP thread that owns a given placeholder phone, if any. Powers CRM→WA
 * reverse routing: a CRM-sent message to the synthetic group contact resolves
 * back to the WhatsApp group by the placeholder phone we assigned it.
 */
export async function getConversationByPlaceholderPhone(
	subaccountId: string,
	placeholderPhone: string,
) {
	return db.whatsAppConversation.findFirst({
		where: { subaccountId, crmPlaceholderPhone: placeholderPhone },
	});
}

/** Cache a contact's display name on the thread (feeds the conversation list). */
export async function setConversationContactName(data: {
	subaccountId: string;
	chatId: string;
	contactName: string;
}) {
	return db.whatsAppConversation.updateMany({
		where: { subaccountId: data.subaccountId, chatId: data.chatId },
		data: { contactName: data.contactName },
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
			id: true,
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

/** Toggle a conversation's unread state (unreadCount 1 when unread, else 0). */
export async function setConversationUnread(data: {
	subaccountId: string;
	chatId: string;
	unread: boolean;
}) {
	return db.whatsAppConversation.updateMany({
		where: { subaccountId: data.subaccountId, chatId: data.chatId },
		data: { unreadCount: data.unread ? 1 : 0 },
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
	data: {
		globalSpintax?: unknown;
		messageTemplates?: unknown;
		groupsEnabled?: boolean;
		noWhatsappTag?: string | null;
		staffTriggers?: unknown;
	},
) {
	return db.whatsAppSettings.upsert({
		where: { subaccountId },
		create: {
			subaccountId,
			globalSpintax: data.globalSpintax ?? undefined,
			messageTemplates: data.messageTemplates ?? undefined,
			groupsEnabled: data.groupsEnabled ?? undefined,
			noWhatsappTag: data.noWhatsappTag ?? undefined,
			staffTriggers: data.staffTriggers ?? undefined,
		},
		update: {
			globalSpintax: data.globalSpintax ?? undefined,
			messageTemplates: data.messageTemplates ?? undefined,
			groupsEnabled: data.groupsEnabled ?? undefined,
			// `noWhatsappTag` is nullable-clearable: an explicit "" clears it, undefined leaves it.
			noWhatsappTag: data.noWhatsappTag === undefined ? undefined : data.noWhatsappTag || null,
			staffTriggers: data.staffTriggers ?? undefined,
		},
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
	/** The waMessageId this message quotes/replies to, if any. */
	quotedMessageId?: string | null;
	/** Where this message entered the hub: "contact" | "ghl" | "app". */
	origin?: string;
	/** The acting staff user who sent an outbound message (app or embedded SSO). */
	sentByUserId?: string | null;
	/** Denormalized display name of {@link sentByUserId} for the thread avatar. */
	sentByName?: string | null;
	/** Inbound group sender's display name (group messages only). */
	authorName?: string | null;
	/** Inbound group sender's phone, digits from `<digits>@c.us` (group only). */
	authorPhone?: string | null;
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

	// Dedup on the WhatsApp message id within a session: an outbound message
	// stored at API-send time and its later `message.sent` webhook echo share a
	// waMessageId and must collapse to a single row. Either write can win the
	// race, so on a hit we MERGE the richer identity into the surviving row: the
	// webhook echo carries no origin/ghlMessageId, and losing them silently
	// breaks CRM provenance and the delivery-status relay. The check-then-insert
	// below is racy by nature; the @@unique([sessionId, waMessageId]) constraint
	// backstops it, and the P2002 catch converges both writers onto one row.
	async function mergeIntoExisting() {
		const existing = await db.whatsAppMessage.findFirst({
			where: { sessionId: data.sessionId, waMessageId: data.waMessageId },
		});
		if (!existing) {
			return null;
		}
		const patch: { ghlMessageId?: string; origin?: string } = {
			...(data.ghlMessageId && !existing.ghlMessageId ? { ghlMessageId: data.ghlMessageId } : {}),
			...(data.origin && data.origin !== "contact" && existing.origin === "contact"
				? { origin: data.origin }
				: {}),
		};
		if (Object.keys(patch).length > 0) {
			return db.whatsAppMessage.update({ where: { id: existing.id }, data: patch });
		}
		return existing;
	}

	if (data.waMessageId) {
		const merged = await mergeIntoExisting();
		if (merged) {
			return merged;
		}
	}

	try {
		return await db.whatsAppMessage.create({
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
				quotedMessageId: data.quotedMessageId ?? null,
				origin: data.origin ?? "contact",
				sentByUserId: data.sentByUserId ?? null,
				sentByName: data.sentByName ?? null,
				authorName: data.authorName ?? null,
				authorPhone: data.authorPhone ?? null,
				ghlMessageId: data.ghlMessageId ?? null,
			},
		});
	} catch (error) {
		// Unique violation on (sessionId, waMessageId): the other writer won the
		// race between our check and insert — merge into their row instead.
		if (
			data.waMessageId &&
			error instanceof Error &&
			"code" in error &&
			(error as { code?: string }).code === "P2002"
		) {
			const merged = await mergeIntoExisting();
			if (merged) {
				return merged;
			}
		}
		throw error;
	}
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

/** A single reaction on a message: one row per sender. */
interface MessageReaction {
	emoji: string;
	senderId: string;
	fromMe: boolean;
}

/**
 * Apply an inbound/outbound reaction to a stored message, matched by
 * (subaccountId, waMessageId). Reactions are a read-modify-write JSON array with
 * one reaction per sender: adding replaces that sender's prior reaction, then
 * pushes the new one unless `remove` is set or `emoji` is empty (WhatsApp signals
 * an un-react with an empty emoji). Idempotent — re-applying the same reaction
 * leaves the array unchanged. No-op if the message isn't found.
 */
export async function applyMessageReaction(data: {
	subaccountId: string;
	waMessageId: string;
	emoji: string;
	senderId: string;
	fromMe: boolean;
	remove?: boolean;
}) {
	const message = await db.whatsAppMessage.findFirst({
		where: { subaccountId: data.subaccountId, waMessageId: data.waMessageId },
	});
	if (!message) {
		return null;
	}

	const current = (message.reactions as MessageReaction[] | null) ?? [];
	// Drop this sender's existing reaction (one reaction per sender).
	const withoutSender = current.filter((reaction) => reaction.senderId !== data.senderId);
	const next =
		data.remove || !data.emoji
			? withoutSender
			: [...withoutSender, { emoji: data.emoji, senderId: data.senderId, fromMe: data.fromMe }];

	return db.whatsAppMessage.update({
		where: { id: message.id },
		data: { reactions: next as unknown as Prisma.InputJsonValue },
	});
}

/**
 * Mark a stored message as deleted/revoked, matched by (subaccountId,
 * waMessageId). No-op if the message isn't tracked in this subaccount.
 */
export async function markMessageDeleted(subaccountId: string, waMessageId: string) {
	return db.whatsAppMessage.updateMany({
		where: { subaccountId, waMessageId },
		data: { deleted: true },
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

// ─── Owner default numbers (per owner, per subaccount) ────────────────────────
// `ownerId` is the same id space as listContactOwners / contact ownership: a GHL
// location user id when GHL is connected, else the agency member's app user id.

/** The owner's preferred sending number in a subaccount, if one is set. */
export async function getOwnerDefaultNumber(subaccountId: string, ownerId: string) {
	return db.ownerDefaultNumber.findUnique({
		where: { subaccountId_ownerId: { subaccountId, ownerId } },
	});
}

/** Set (or change) an owner's default sending number for a subaccount. */
export async function setOwnerDefaultNumber(data: {
	subaccountId: string;
	ownerId: string;
	sessionId: string;
}) {
	return db.ownerDefaultNumber.upsert({
		where: {
			subaccountId_ownerId: { subaccountId: data.subaccountId, ownerId: data.ownerId },
		},
		create: {
			subaccountId: data.subaccountId,
			ownerId: data.ownerId,
			sessionId: data.sessionId,
		},
		update: { sessionId: data.sessionId },
	});
}

/** Clear an owner's default sending number for a subaccount (no-op if unset). */
export async function clearOwnerDefaultNumber(subaccountId: string, ownerId: string) {
	return db.ownerDefaultNumber.deleteMany({
		where: { subaccountId, ownerId },
	});
}

/** All owner→number defaults for a subaccount, with the target number (settings UI). */
export async function listOwnerDefaultNumbers(subaccountId: string) {
	return db.ownerDefaultNumber.findMany({
		where: { subaccountId },
		orderBy: { createdAt: "asc" },
		include: {
			session: { select: { id: true, label: true, phone: true } },
		},
	});
}
