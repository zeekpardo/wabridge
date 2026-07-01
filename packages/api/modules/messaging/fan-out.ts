/**
 * The message hub. Every message — inbound from WhatsApp, GHL-originated
 * (SMS takeover / workflow / bulk), or sent from our embedded messenger —
 * flows through `fanOutMessage`, which persists it once (de-duped) and projects
 * it to the other surfaces. This is the anti-loop / anti-duplicate contract that
 * lets Option B (SMS takeover) and our own messenger coexist.
 *
 *   contact (WA inbound) → store + push to GHL (inbound) + notify our UI
 *   ghl     (SMS out)    → store + send over WhatsApp        + notify our UI
 *   app     (our UI out) → store + send over WhatsApp + record outbound in GHL
 *
 * WhatsApp `fromMe` echoes and re-delivered webhooks collapse via the waMessageId
 * / ghlMessageId de-dupe below (mirroring the store's existing idempotency).
 */

export type MessageOrigin = "contact" | "ghl" | "app";

export interface CanonicalMessage {
	subaccountId: string;
	organizationId: string;
	/** The WhatsApp session row that owns this thread (for storage + sending). */
	sessionId: string;
	/** WhatsApp chat id, e.g. `15551234567@c.us`. */
	chatId: string;
	direction: "inbound" | "outbound";
	origin: MessageOrigin;
	body: string | null;
	type: string;
	attachments?: string[];
	waMessageId?: string | null;
	/** Present for GHL-originated messages (the id to de-dupe + status against). */
	ghlMessageId?: string | null;
	timestamp: Date;
}

export interface ProjectionPlan {
	sendOverWhatsApp: boolean;
	pushGhlInbound: boolean;
	recordGhlOutbound: boolean;
	notifyApp: boolean;
}

/**
 * The pure routing decision — which projections fire for a given origin. Kept
 * pure so the coexistence contract is exhaustively unit-testable.
 */
export function planProjections(origin: MessageOrigin): ProjectionPlan {
	switch (origin) {
		case "contact":
			// Inbound from the contact: mirror into GHL, show in our UI. Never re-send.
			return {
				sendOverWhatsApp: false,
				pushGhlInbound: true,
				recordGhlOutbound: false,
				notifyApp: true,
			};
		case "ghl":
			// GHL asked us to deliver (SMS takeover): send over WA, don't re-post to
			// GHL. Delivery status is reconciled later from the WhatsApp ack.
			return {
				sendOverWhatsApp: true,
				pushGhlInbound: false,
				recordGhlOutbound: false,
				notifyApp: true,
			};
		case "app":
			// Sent from our messenger: deliver over WA and record it in GHL so the
			// native thread stays complete for reps living in GHL.
			return {
				sendOverWhatsApp: true,
				pushGhlInbound: false,
				recordGhlOutbound: true,
				notifyApp: true,
			};
	}
}

export interface FanOutDeps {
	findByWaMessageId(subaccountId: string, waMessageId: string): Promise<{ id: string } | null>;
	findByGhlMessageId(subaccountId: string, ghlMessageId: string): Promise<{ id: string } | null>;
	persist(message: CanonicalMessage): Promise<{ id: string }>;
	/** Deliver over WhatsApp; returns the WA message id when known. */
	sendOverWhatsApp(message: CanonicalMessage): Promise<{ waMessageId: string | null }>;
	/** Mirror an inbound message into GHL; returns the GHL message id, or null. */
	pushGhlInbound(message: CanonicalMessage): Promise<{ ghlMessageId: string | null } | null>;
	/** Record an outbound message in GHL's timeline; returns the GHL message id. */
	recordGhlOutbound(message: CanonicalMessage): Promise<{ ghlMessageId: string | null } | null>;
	/** Persist our-row ↔ GHL-id mapping so echoes/status can be matched. */
	markSynced(id: string, ghlMessageId: string | null): Promise<void>;
	/** Realtime nudge to the embedded messenger (best-effort). */
	notifyApp(message: CanonicalMessage): Promise<void> | void;
}

export interface FanOutResult {
	deduped: boolean;
	messageId?: string;
	ghlMessageId?: string | null;
	waMessageId?: string | null;
}

/**
 * Persist-then-project. De-dupes on the natural key for the origin, sends over
 * WhatsApp for outbound, stores, then mirrors to GHL per {@link planProjections}.
 */
export async function fanOutMessage(
	message: CanonicalMessage,
	deps: FanOutDeps,
): Promise<FanOutResult> {
	// 1. De-dupe against the origin's natural key so echoes/redeliveries collapse.
	if (message.waMessageId) {
		const existing = await deps.findByWaMessageId(message.subaccountId, message.waMessageId);
		if (existing) {
			return { deduped: true, messageId: existing.id };
		}
	}
	if (message.ghlMessageId) {
		const existing = await deps.findByGhlMessageId(message.subaccountId, message.ghlMessageId);
		if (existing) {
			return { deduped: true, messageId: existing.id };
		}
	}

	const plan = planProjections(message.origin);

	// 2. Outbound delivery happens before persistence so we can store the WA id.
	let waMessageId = message.waMessageId ?? null;
	if (plan.sendOverWhatsApp) {
		const sent = await deps.sendOverWhatsApp(message);
		waMessageId = sent.waMessageId ?? waMessageId;
	}

	// 3. Persist the canonical row.
	const stored = await deps.persist({ ...message, waMessageId });

	// 4. Project to GHL.
	let ghlMessageId: string | null = message.ghlMessageId ?? null;
	if (plan.pushGhlInbound) {
		const res = await deps.pushGhlInbound({ ...message, waMessageId });
		if (res?.ghlMessageId) {
			ghlMessageId = res.ghlMessageId;
			await deps.markSynced(stored.id, ghlMessageId);
		}
	}
	if (plan.recordGhlOutbound) {
		const res = await deps.recordGhlOutbound({ ...message, waMessageId });
		if (res?.ghlMessageId) {
			ghlMessageId = res.ghlMessageId;
			await deps.markSynced(stored.id, ghlMessageId);
		}
	}

	// 5. Nudge the embedded messenger.
	if (plan.notifyApp) {
		await deps.notifyApp({ ...message, waMessageId });
	}

	return { deduped: false, messageId: stored.id, ghlMessageId, waMessageId };
}
