import {
	createWhatsAppMessage,
	getWhatsAppSessionByOpenwaSessionId,
	touchConversationOutbound,
	updateWhatsAppMessageStatus,
	updateWhatsAppSession,
	upsertConversationInbound,
} from "@repo/database";
import { logger } from "@repo/logs";

import { OPENWA_WEBHOOK_EVENTS } from "./types";
import { parseOpenWaWebhookPayload, verifyOpenWaSignature } from "./webhook";

/** An inbound (contact → us) WhatsApp message, normalized for the hooks. */
export interface OpenWaInboundMessage {
	subaccountId: string;
	organizationId: string;
	sessionId: string;
	chatId: string;
	body: string | null;
	type: string;
	waMessageId: string | null;
	timestamp: Date;
	/**
	 * The sender's real phone (MSISDN digits), resolved by OpenWA for `@lid`
	 * privacy-id senders (RESOLVE_LID_TO_PHONE). Null/absent when unresolvable —
	 * consumers must NOT fall back to the `@lid` digits, which are not a phone.
	 */
	senderPhone?: string | null;
	/**
	 * For GROUP messages (chatId ends `@g.us`), the author (the group member who
	 * sent this) display name — from `pushName`/`notifyName`. Null/absent for 1:1
	 * chats, where the sender IS the conversation contact. Never used as the
	 * conversation's name for a group (that's the GROUP subject, sourced elsewhere).
	 */
	authorName?: string | null;
	/**
	 * For GROUP messages, the author's phone (MSISDN digits from `<digits>@c.us`).
	 * Null/absent for 1:1 chats.
	 */
	authorPhone?: string | null;
}

/**
 * An outbound (us → contact) WhatsApp message, from the `message.sent` echo.
 * Covers BOTH messages our app sent (already recorded) and ones the rep sent
 * from the linked phone's own WhatsApp. The hub de-dupes on waMessageId so only
 * genuine phone-originated sends are mirrored to the CRM.
 */
export interface OpenWaOutboundMessage {
	subaccountId: string;
	organizationId: string;
	sessionId: string;
	chatId: string;
	body: string | null;
	type: string;
	waMessageId: string | null;
	timestamp: Date;
}

/** A delivery/read receipt for a message we sent. */
export interface OpenWaMessageAck {
	subaccountId: string;
	sessionId: string;
	waMessageId: string;
	status: string;
}

/**
 * An inbound reaction to a message (add or un-react). The gateway sends an empty
 * `emoji` to signal an un-react (WhatsApp's clear-reaction), surfaced here as
 * `remove: true` so consumers don't have to special-case the empty string.
 */
export interface OpenWaReactionEvent {
	subaccountId: string;
	sessionId: string;
	chatId: string;
	/** The reacted-to message's WhatsApp id. */
	waMessageId: string;
	/** The reactor's neutral JID (resolved by the gateway). */
	senderId: string;
	emoji: string;
	remove: boolean;
}

/** An inbound revoke ("delete for everyone") of a previously-seen message. */
export interface OpenWaRevokeEvent {
	subaccountId: string;
	sessionId: string;
	chatId: string;
	/** The revoked message's WhatsApp id. */
	waMessageId: string;
}

/** Why a session stopped being able to send/receive. */
export type OpenWaSessionDownReason = "disconnected" | "logged_out";

/**
 * A WhatsApp session transitioned from healthy (`ready`, not awaiting a QR scan)
 * to unable to deliver — the gateway either dropped the connection or the number
 * logged out and now needs a fresh QR scan. Fired ONCE per down-episode (on the
 * healthy→unhealthy edge), so a QR-regeneration storm does not fan out into a
 * flood of alerts.
 */
export interface OpenWaSessionHealthEvent {
	subaccountId: string;
	organizationId: string;
	sessionId: string;
	/** The session's status after the transition (e.g. the gateway's status, or "disconnected"). */
	status: string;
	reason: OpenWaSessionDownReason;
}

/**
 * Extension points the API layer injects so higher layers (the message hub,
 * CRM sync) can react to webhook events without this package depending on
 * them (@repo/api already depends on @repo/whatsapp).
 */
export interface OpenWaWebhookHooks {
	/**
	 * Handles an inbound contact message END-TO-END (persistence included) —
	 * when provided, the handler skips its own message insert and delegates to
	 * this (the hub persists with the same waMessageId de-dupe).
	 */
	onInboundMessage?(event: OpenWaInboundMessage): Promise<void>;
	/**
	 * Handles an outbound message END-TO-END (persistence included) from the
	 * `message.sent` echo — when provided, the handler skips its own insert. The
	 * hub de-dupes on waMessageId, so a message our app already sent+recorded is a
	 * no-op and only phone-originated sends get persisted + mirrored to the CRM.
	 */
	onOutboundMessage?(event: OpenWaOutboundMessage): Promise<void>;
	/** Fired after the local status update; must not throw. */
	onMessageAck?(event: OpenWaMessageAck): Promise<void>;
	/** Fired for an inbound reaction (add or un-react); must not throw. */
	onReaction?(event: OpenWaReactionEvent): Promise<void>;
	/** Fired for an inbound revoke ("delete for everyone"); must not throw. */
	onRevoke?(event: OpenWaRevokeEvent): Promise<void>;
	/**
	 * Fired once when a session goes from healthy to unable to deliver (a
	 * disconnect or a logout that needs a new QR scan). Use it to alert operators
	 * so a silent drop doesn't strand outbound messages. Must not throw.
	 */
	onSessionDown?(event: OpenWaSessionHealthEvent): Promise<void>;
}

/**
 * Public inbound webhook handler for OpenWA -> us deliveries. Mirrors the
 * payments webhook handler style: reads the raw body, verifies the
 * `X-OpenWA-Signature` HMAC against the target session's stored secret, then
 * processes the event. Returns a `Response`.
 */
export async function webhookHandler(req: Request, hooks?: OpenWaWebhookHooks): Promise<Response> {
	const rawBody = await req.text();

	if (!rawBody) {
		return new Response("Invalid request.", { status: 400 });
	}

	let payload: ReturnType<typeof parseOpenWaWebhookPayload>;
	try {
		payload = parseOpenWaWebhookPayload(rawBody);
	} catch (error) {
		logger.error(error, { ctx: "whatsapp.webhook.parse" });
		return new Response("Invalid request.", { status: 400 });
	}

	const row = await getWhatsAppSessionByOpenwaSessionId(payload.sessionId);

	if (!row) {
		// Unknown session — acknowledge without processing to avoid retries.
		return new Response("Unknown session.", { status: 404 });
	}

	const signatureValid = verifyOpenWaSignature(
		row.webhookSecret,
		rawBody,
		req.headers.get("X-OpenWA-Signature"),
	);

	if (!signatureValid) {
		return new Response("Invalid signature.", { status: 401 });
	}

	try {
		await processEvent(
			row.id,
			row.subaccountId,
			row.organizationId,
			// The pre-update session state, so a session-event handler can detect a
			// healthy→unhealthy edge and alert exactly once.
			{ status: row.status, needsQr: row.needsQr },
			payload,
			hooks,
		);
	} catch (error) {
		logger.error(error, { ctx: "whatsapp.webhook.process", event: payload.event });
		return new Response("Processing error.", { status: 500 });
	}

	return new Response("OK", { status: 200 });
}

async function processEvent(
	sessionId: string,
	subaccountId: string,
	organizationId: string,
	previous: { status: string; needsQr: boolean },
	payload: ReturnType<typeof parseOpenWaWebhookPayload>,
	hooks?: OpenWaWebhookHooks,
): Promise<void> {
	const data = payload.data as Record<string, unknown>;

	switch (payload.event) {
		case OPENWA_WEBHOOK_EVENTS.messageReceived:
		case OPENWA_WEBHOOK_EVENTS.messageSent: {
			// message.received => inbound; message.sent => outbound (fromMe, whether
			// sent through our API or directly from the linked phone). Dedup on
			// waMessageId (in createWhatsAppMessage / the hub) collapses the API-send
			// row and its message.sent webhook echo into one.
			const outbound = payload.event === OPENWA_WEBHOOK_EVENTS.messageSent;
			const chatId = String(data.chatId ?? "");
			const body = typeof data.body === "string" ? data.body : null;
			const type = String(data.type ?? "text");
			const timestamp = parseTimestamp(payload.timestamp);
			const isGroup = chatId.endsWith("@g.us");

			// The sender's display name from the gateway. For a 1:1 chat this is the
			// contact; for a GROUP it's the AUTHOR (a group member), which must NOT
			// become the conversation name — the conversation name is the group
			// subject (sourced elsewhere).
			const senderName =
				typeof data.pushName === "string"
					? data.pushName
					: typeof data.notifyName === "string"
						? data.notifyName
						: null;
			// Group author phone: prefer the gateway's resolved senderPhone, else the
			// digits of the `<digits>@c.us` author JID. `@lid` author ids are opaque
			// privacy ids and are NOT a phone, so they're left null.
			const authorPhone = isGroup
				? typeof data.senderPhone === "string"
					? data.senderPhone
					: typeof data.author === "string" && data.author.endsWith("@c.us")
						? data.author.replace(/@.*/, "")
						: null
				: null;
			const authorName = isGroup ? senderName : null;

			// Keep the conversation thread fresh BEFORE persisting the message, so
			// downstream projections (e.g. GHL contact upsert) see the contact name.
			// Inbound reply-locks the thread to the receiving number; outbound just
			// refreshes it.
			if (chatId) {
				const preview = body ? body.slice(0, 140) : `[${type}]`;
				if (outbound) {
					await touchConversationOutbound({
						subaccountId,
						organizationId,
						chatId,
						sessionId,
						preview,
					});
				} else {
					// For a GROUP thread, do NOT set contactName from the sender — that's
					// the author (a member), not the conversation name (the group
					// subject, sourced elsewhere). Only 1:1 chats name the thread from
					// the sender.
					await upsertConversationInbound({
						subaccountId,
						organizationId,
						chatId,
						sessionId,
						preview,
						contactName: isGroup ? null : senderName,
					});
				}
			}

			// Inbound contact messages route through the hub when wired (persist +
			// GHL mirror + app notify, de-duped on waMessageId). Outbound echoes and
			// hook-less deployments keep the direct local insert.
			if (!outbound && hooks?.onInboundMessage && chatId) {
				await hooks.onInboundMessage({
					subaccountId,
					organizationId,
					sessionId,
					chatId,
					body,
					type,
					waMessageId: typeof data.id === "string" ? data.id : null,
					timestamp,
					senderPhone: typeof data.senderPhone === "string" ? data.senderPhone : null,
					authorName,
					authorPhone,
				});
				break;
			}

			// Outbound (message.sent echo) also routes through the hub so a send from
			// the linked phone's own WhatsApp still records to the CRM. De-duped on
			// waMessageId, so the echo of a message our app already sent is a no-op.
			if (outbound && hooks?.onOutboundMessage && chatId) {
				await hooks.onOutboundMessage({
					subaccountId,
					organizationId,
					sessionId,
					chatId,
					body,
					type,
					waMessageId: typeof data.id === "string" ? data.id : null,
					timestamp,
				});
				break;
			}

			await createWhatsAppMessage({
				subaccountId,
				organizationId,
				sessionId,
				direction: outbound ? "outbound" : "inbound",
				chatId,
				fromMe: outbound ? true : Boolean(data.fromMe ?? false),
				type,
				body,
				status: typeof data.status === "string" ? data.status : outbound ? "sent" : null,
				waMessageId: typeof data.id === "string" ? data.id : null,
				idempotencyKey: payload.idempotencyKey,
				timestamp,
				// Group author (inbound only); null for 1:1 and for outbound echoes.
				authorName: outbound ? null : authorName,
				authorPhone: outbound ? null : authorPhone,
			});
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.messageAck: {
			// Delivery/read receipt for a message we already have — update its status.
			const waMessageId = typeof data.id === "string" ? data.id : null;
			const status = typeof data.status === "string" ? data.status : null;
			if (waMessageId && status) {
				await updateWhatsAppMessageStatus(sessionId, waMessageId, status);
				// Let the API layer relay the status upstream (e.g. GHL provider
				// message status). Best-effort by contract.
				await hooks?.onMessageAck?.({ subaccountId, sessionId, waMessageId, status });
			}
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.messageReaction: {
			// Inbound reaction. Gateway payload is the ReactionEvent plus a post-apply
			// snapshot: { messageId, chatId, reaction, senderId, reactions }. An empty
			// `reaction` is WhatsApp's un-react signal — surface it as remove.
			const waMessageId = typeof data.messageId === "string" ? data.messageId : null;
			const chatId = typeof data.chatId === "string" ? data.chatId : null;
			const senderId = typeof data.senderId === "string" ? data.senderId : null;
			const emoji = typeof data.reaction === "string" ? data.reaction : "";
			if (hooks?.onReaction && waMessageId && chatId && senderId) {
				await hooks.onReaction({
					subaccountId,
					sessionId,
					chatId,
					waMessageId,
					senderId,
					emoji,
					remove: emoji === "",
				});
			}
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.messageRevoked: {
			// Inbound revoke ("delete for everyone"). Gateway payload is the raw
			// RevokedMessage: { id, chatId, from, to, type, body, timestamp }.
			const waMessageId = typeof data.id === "string" ? data.id : null;
			const chatId = typeof data.chatId === "string" ? data.chatId : null;
			if (hooks?.onRevoke && waMessageId && chatId) {
				await hooks.onRevoke({ subaccountId, sessionId, chatId, waMessageId });
			}
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.sessionStatus:
		case OPENWA_WEBHOOK_EVENTS.sessionAuthenticated:
		case OPENWA_WEBHOOK_EVENTS.sessionDisconnected: {
			const status = typeof data.status === "string" ? data.status : undefined;
			const authenticated = payload.event === OPENWA_WEBHOOK_EVENTS.sessionAuthenticated;
			await updateWhatsAppSession(subaccountId, sessionId, {
				...(status ? { status } : {}),
				...(authenticated ? { needsQr: false, connectedAt: new Date() } : {}),
				...(typeof data.phone === "string" ? { phone: data.phone } : {}),
				...(typeof data.jid === "string" ? { jid: data.jid } : {}),
			});
			// Alert on the healthy→down edge. Only sessionAuthenticated clears
			// needsQr; the others leave it as-is, so the next state is the new status
			// (or the prior one) plus the unchanged QR flag.
			await alertIfSessionWentDown(
				hooks,
				{ subaccountId, organizationId, sessionId },
				previous,
				{ status: status ?? previous.status, needsQr: authenticated ? false : previous.needsQr },
				"disconnected",
			);
			break;
		}
		case OPENWA_WEBHOOK_EVENTS.sessionQr: {
			await updateWhatsAppSession(subaccountId, sessionId, { needsQr: true });
			// A fresh QR means the number logged out and must be re-scanned.
			await alertIfSessionWentDown(
				hooks,
				{ subaccountId, organizationId, sessionId },
				previous,
				{ status: previous.status, needsQr: true },
				"logged_out",
			);
			break;
		}
		default:
			// Any unhandled event types are acknowledged as no-ops.
			break;
	}
}

/**
 * Fire {@link OpenWaWebhookHooks.onSessionDown} only on the healthy→unhealthy
 * edge. "Healthy" is `status === "ready"` with no pending QR scan; anything else
 * is down. Gating on the edge means a burst of QR-regeneration events (a logged-
 * out number the gateway keeps re-QRing) produces exactly one alert — the first
 * event flips the persisted state, so every later event already reads as down.
 * Best-effort by contract: a hook failure must not fail the webhook.
 */
async function alertIfSessionWentDown(
	hooks: OpenWaWebhookHooks | undefined,
	ids: { subaccountId: string; organizationId: string; sessionId: string },
	previous: { status: string; needsQr: boolean },
	next: { status: string; needsQr: boolean },
	reason: OpenWaSessionDownReason,
): Promise<void> {
	if (!hooks?.onSessionDown) {
		return;
	}
	const wasHealthy = previous.status === "ready" && !previous.needsQr;
	const healthyNow = next.status === "ready" && !next.needsQr;
	if (!wasHealthy || healthyNow) {
		return;
	}
	await hooks.onSessionDown({ ...ids, status: next.status, reason });
}

function parseTimestamp(value: string): Date {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
