// ─── OpenWA session status ────────────────────────────────────────────────────

export const OPENWA_SESSION_STATUSES = {
	created: "created",
	initializing: "initializing",
	qrReady: "qr_ready",
	authenticating: "authenticating",
	ready: "ready",
	disconnected: "disconnected",
	failed: "failed",
} as const;

export type OpenWaSessionStatus =
	(typeof OPENWA_SESSION_STATUSES)[keyof typeof OPENWA_SESSION_STATUSES];

// ─── OpenWA REST resources ────────────────────────────────────────────────────

export interface OpenWaSession {
	id: string;
	name: string;
	status: OpenWaSessionStatus;
	phone?: string | null;
	jid?: string | null;
	[key: string]: unknown;
}

export interface OpenWaQrResponse {
	/**
	 * Data URL, e.g. `data:image/png;base64,...`. May be `null` until the
	 * session reaches the `qr_ready` status.
	 */
	qrCode: string | null;
}

export interface OpenWaPairingCodeResponse {
	/**
	 * Pairing code returned by OpenWA. Field name assumed to be `pairingCode`;
	 * the raw JSON is returned so callers can read whatever OpenWA sends.
	 */
	pairingCode?: string;
	[key: string]: unknown;
}

export interface OpenWaSendTextResult {
	/**
	 * Provider message id assigned by WhatsApp, when available.
	 */
	id?: string;
	[key: string]: unknown;
}

// ─── Webhook registration ─────────────────────────────────────────────────────

export const OPENWA_WEBHOOK_EVENTS = {
	messageReceived: "message.received",
	messageSent: "message.sent",
	messageAck: "message.ack",
	sessionStatus: "session.status",
	sessionQr: "session.qr",
	sessionAuthenticated: "session.authenticated",
	sessionDisconnected: "session.disconnected",
} as const;

export type OpenWaWebhookEvent =
	(typeof OPENWA_WEBHOOK_EVENTS)[keyof typeof OPENWA_WEBHOOK_EVENTS];

export interface OpenWaWebhookRegistration {
	url: string;
	events: OpenWaWebhookEvent[];
	secret: string;
	filters?: Record<string, unknown>;
}

// ─── Inbound webhook payload (OpenWA -> us) ───────────────────────────────────

export interface OpenWaWebhookPayload<TData = Record<string, unknown>> {
	event: OpenWaWebhookEvent | string;
	timestamp: string;
	sessionId: string;
	idempotencyKey: string;
	deliveryId: string;
	data: TData;
}
