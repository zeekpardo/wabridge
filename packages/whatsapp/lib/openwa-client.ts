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
