import type {
	OpenWaPairingCodeResponse,
	OpenWaQrResponse,
	OpenWaSendTextResult,
	OpenWaSession,
	OpenWaWebhookEvent,
} from "./types";

export interface OpenWaClientConfig {
	baseUrl: string;
	apiKey: string;
}

export interface CreateSessionInput {
	/**
	 * Globally-unique session name in OpenWA (max 100 chars).
	 */
	name: string;
}

export interface RegisterWebhookInput {
	url: string;
	events: OpenWaWebhookEvent[];
	secret: string;
	filters?: Record<string, unknown>;
}

export interface SendTextInput {
	/**
	 * WhatsApp chat id, e.g. `15551234567@c.us`.
	 */
	chatId: string;
	text: string;
}

export interface OpenWaChat {
	id: string;
	name?: string;
	isGroup: boolean;
	unreadCount: number;
	/** Unix seconds of the last message. */
	timestamp: number;
	lastMessage?: string;
}

export interface OpenWaHistoryMessage {
	id: string;
	chatId: string;
	from?: string;
	to?: string;
	body?: string;
	type: string;
	/** Unix seconds. */
	timestamp: number;
	fromMe: boolean;
	isGroup?: boolean;
	/** Present when the history was fetched with includeMedia. */
	media?: { mimetype?: string; data?: string } | null;
}

export type OpenWaMediaKind = "image" | "video" | "audio" | "document";

export interface SendMediaInput {
	chatId: string;
	/** Media source URL (or provide base64 + mimetype). */
	url?: string;
	base64?: string;
	mimetype?: string;
	filename?: string;
	caption?: string;
}

export interface ReplyMessageInput {
	chatId: string;
	/** Provider id of the message being quoted/replied to. */
	quotedMessageId: string;
	text: string;
}

export interface ForwardMessageInput {
	fromChatId: string;
	toChatId: string;
	messageId: string;
}

export interface ReactMessageInput {
	chatId: string;
	messageId: string;
	/** Emoji to react with; send an empty string to remove the reaction. */
	emoji: string;
}

export interface DeleteMessageInput {
	chatId: string;
	messageId: string;
	/** Delete for everyone (default true on the gateway). */
	forEveryone?: boolean;
}

export interface SendLocationInput {
	chatId: string;
	latitude: number;
	longitude: number;
	description?: string;
	address?: string;
}

export interface SendContactInput {
	chatId: string;
	contactName: string;
	contactNumber: string;
}

/** Presence indicator sent to a chat: 'typing'/'recording' show it, 'paused' clears it. */
export type OpenWaChatState = "typing" | "recording" | "paused";

export interface OpenWaClient {
	createSession(input: CreateSessionInput): Promise<OpenWaSession>;
	listSessions(): Promise<OpenWaSession[]>;
	getSession(id: string): Promise<OpenWaSession>;
	deleteSession(id: string): Promise<void>;
	startSession(id: string): Promise<void>;
	stopSession(id: string): Promise<void>;
	getQr(id: string): Promise<OpenWaQrResponse>;
	requestPairingCode(id: string, phoneNumber: string): Promise<OpenWaPairingCodeResponse>;
	getChats(id: string): Promise<OpenWaChat[]>;
	/**
	 * Resolve a contact id (e.g. an `@lid` privacy id) to a phone number (MSISDN
	 * digits, no `+`), best-effort. Null when the engine can't map it.
	 */
	resolveContactPhone(id: string, contactId: string): Promise<string | null>;
	getChatHistory(
		id: string,
		chatId: string,
		limit?: number,
		includeMedia?: boolean,
	): Promise<OpenWaHistoryMessage[]>;
	sendText(id: string, input: SendTextInput): Promise<OpenWaSendTextResult>;
	sendMedia(
		id: string,
		kind: OpenWaMediaKind,
		input: SendMediaInput,
	): Promise<OpenWaSendTextResult>;
	replyMessage(id: string, input: ReplyMessageInput): Promise<OpenWaSendTextResult>;
	forwardMessage(id: string, input: ForwardMessageInput): Promise<OpenWaSendTextResult>;
	reactMessage(id: string, input: ReactMessageInput): Promise<void>;
	deleteMessage(id: string, input: DeleteMessageInput): Promise<void>;
	sendLocation(id: string, input: SendLocationInput): Promise<OpenWaSendTextResult>;
	sendContact(id: string, input: SendContactInput): Promise<OpenWaSendTextResult>;
	getMessageReactions(id: string, chatId: string, messageId: string): Promise<unknown>;
	markChatRead(id: string, chatId: string): Promise<void>;
	markChatUnread(id: string, chatId: string): Promise<void>;
	sendChatState(id: string, chatId: string, state: OpenWaChatState): Promise<void>;
	getProfilePicture(id: string, contactId: string): Promise<string | null>;
	registerWebhook(id: string, input: RegisterWebhookInput): Promise<unknown>;
}

/**
 * Normalizes an E.164 (or loosely formatted) phone number into an OpenWA chat
 * id: strips `+` and any non-digit characters, then appends the `@c.us` suffix.
 */
export function toChatId(phoneE164: string): string {
	const digits = phoneE164.replace(/\D/g, "");
	return `${digits}@c.us`;
}

class OpenWaHttpClient implements OpenWaClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(config: OpenWaClientConfig) {
		// Trim a trailing slash so path concatenation stays predictable.
		this.baseUrl = config.baseUrl.replace(/\/$/, "");
		this.apiKey = config.apiKey;
	}

	private async request<TResult>(method: string, path: string, body?: unknown): Promise<TResult> {
		const headers: Record<string, string> = {
			"X-API-Key": this.apiKey,
		};

		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}

		const response = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new Error(
				`OpenWA request failed: ${method} ${path} -> ${response.status} ${detail}`.trim(),
			);
		}

		if (response.status === 204) {
			return undefined as TResult;
		}

		const text = await response.text();
		if (!text) {
			return undefined as TResult;
		}

		return JSON.parse(text) as TResult;
	}

	createSession(input: CreateSessionInput): Promise<OpenWaSession> {
		return this.request<OpenWaSession>("POST", "/sessions", { name: input.name });
	}

	listSessions(): Promise<OpenWaSession[]> {
		return this.request<OpenWaSession[]>("GET", "/sessions");
	}

	getSession(id: string): Promise<OpenWaSession> {
		return this.request<OpenWaSession>("GET", `/sessions/${id}`);
	}

	async deleteSession(id: string): Promise<void> {
		await this.request<void>("DELETE", `/sessions/${id}`);
	}

	async startSession(id: string): Promise<void> {
		await this.request<void>("POST", `/sessions/${id}/start`);
	}

	async stopSession(id: string): Promise<void> {
		await this.request<void>("POST", `/sessions/${id}/stop`);
	}

	getQr(id: string): Promise<OpenWaQrResponse> {
		return this.request<OpenWaQrResponse>("GET", `/sessions/${id}/qr`);
	}

	requestPairingCode(id: string, phoneNumber: string): Promise<OpenWaPairingCodeResponse> {
		return this.request<OpenWaPairingCodeResponse>("POST", `/sessions/${id}/pairing-code`, {
			phoneNumber,
		});
	}

	getChats(id: string): Promise<OpenWaChat[]> {
		return this.request<OpenWaChat[]>("GET", `/sessions/${id}/chats`);
	}

	async resolveContactPhone(id: string, contactId: string): Promise<string | null> {
		const res = await this.request<{ contactId: string; phone: string | null }>(
			"GET",
			`/sessions/${id}/contacts/${encodeURIComponent(contactId)}/phone`,
		);
		const digits = res?.phone?.replace(/\D/g, "");
		return digits && digits.length >= 6 ? digits : null;
	}

	getChatHistory(
		id: string,
		chatId: string,
		limit = 50,
		includeMedia = false,
	): Promise<OpenWaHistoryMessage[]> {
		const query = `limit=${limit}${includeMedia ? "&includeMedia=true" : ""}`;
		return this.request<OpenWaHistoryMessage[]>(
			"GET",
			`/sessions/${id}/messages/${encodeURIComponent(chatId)}/history?${query}`,
		);
	}

	sendText(id: string, input: SendTextInput): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/send-text`, {
			chatId: input.chatId,
			text: input.text,
		});
	}

	sendMedia(
		id: string,
		kind: OpenWaMediaKind,
		input: SendMediaInput,
	): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/send-${kind}`, {
			chatId: input.chatId,
			...(input.url ? { url: input.url } : {}),
			...(input.base64 ? { base64: input.base64 } : {}),
			...(input.mimetype ? { mimetype: input.mimetype } : {}),
			...(input.filename ? { filename: input.filename } : {}),
			...(input.caption ? { caption: input.caption } : {}),
		});
	}

	replyMessage(id: string, input: ReplyMessageInput): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/reply`, {
			chatId: input.chatId,
			quotedMessageId: input.quotedMessageId,
			text: input.text,
		});
	}

	forwardMessage(id: string, input: ForwardMessageInput): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/forward`, {
			fromChatId: input.fromChatId,
			toChatId: input.toChatId,
			messageId: input.messageId,
		});
	}

	async reactMessage(id: string, input: ReactMessageInput): Promise<void> {
		await this.request<{ success: boolean }>("POST", `/sessions/${id}/messages/react`, {
			chatId: input.chatId,
			messageId: input.messageId,
			emoji: input.emoji,
		});
	}

	async deleteMessage(id: string, input: DeleteMessageInput): Promise<void> {
		await this.request<{ success: boolean }>("POST", `/sessions/${id}/messages/delete`, {
			chatId: input.chatId,
			messageId: input.messageId,
			...(input.forEveryone !== undefined ? { forEveryone: input.forEveryone } : {}),
		});
	}

	sendLocation(id: string, input: SendLocationInput): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/send-location`, {
			chatId: input.chatId,
			latitude: input.latitude,
			longitude: input.longitude,
			...(input.description ? { description: input.description } : {}),
			...(input.address ? { address: input.address } : {}),
		});
	}

	sendContact(id: string, input: SendContactInput): Promise<OpenWaSendTextResult> {
		return this.request<OpenWaSendTextResult>("POST", `/sessions/${id}/messages/send-contact`, {
			chatId: input.chatId,
			contactName: input.contactName,
			contactNumber: input.contactNumber,
		});
	}

	getMessageReactions(id: string, chatId: string, messageId: string): Promise<unknown> {
		return this.request<unknown>(
			"GET",
			`/sessions/${id}/messages/${encodeURIComponent(chatId)}/${encodeURIComponent(messageId)}/reactions`,
		);
	}

	async markChatRead(id: string, chatId: string): Promise<void> {
		await this.request<{ success: boolean }>("POST", `/sessions/${id}/chats/read`, { chatId });
	}

	async markChatUnread(id: string, chatId: string): Promise<void> {
		await this.request<{ success: boolean }>("POST", `/sessions/${id}/chats/unread`, { chatId });
	}

	async sendChatState(id: string, chatId: string, state: OpenWaChatState): Promise<void> {
		await this.request<{ success: boolean }>("POST", `/sessions/${id}/chats/typing`, {
			chatId,
			state,
		});
	}

	async getProfilePicture(id: string, contactId: string): Promise<string | null> {
		const res = await this.request<{ url?: string | null }>(
			"GET",
			`/sessions/${id}/contacts/${encodeURIComponent(contactId)}/profile-picture`,
		);
		return res?.url ?? null;
	}

	registerWebhook(id: string, input: RegisterWebhookInput): Promise<unknown> {
		return this.request<unknown>("POST", `/sessions/${id}/webhooks`, {
			url: input.url,
			events: input.events,
			secret: input.secret,
			...(input.filters ? { filters: input.filters } : {}),
		});
	}
}

/**
 * Creates an OpenWA REST client. Reads `OPENWA_BASE_URL` and `OPENWA_API_KEY`
 * from the environment unless overridden via `config`. Auth is a static API key
 * sent as the `X-API-Key` header — there is no OAuth.
 */
export function createOpenWaClient(config?: Partial<OpenWaClientConfig>): OpenWaClient {
	const baseUrl = config?.baseUrl ?? process.env.OPENWA_BASE_URL;
	const apiKey = config?.apiKey ?? process.env.OPENWA_API_KEY;

	if (!baseUrl) {
		throw new Error("OPENWA_BASE_URL is not configured.");
	}

	if (!apiKey) {
		throw new Error("OPENWA_API_KEY is not configured.");
	}

	// OpenWA REST endpoints live under `/api`.
	return new OpenWaHttpClient({ baseUrl: `${baseUrl}/api`, apiKey });
}
