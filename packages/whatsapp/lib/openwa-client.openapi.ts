/**
 * PROTOTYPE — a typed OpenWA client generated from the gateway's own OpenAPI
 * spec (`openapi/openwa-openapi.json` → `openapi/openwa-schema.ts`), wrapped
 * behind the SAME `OpenWaClient` interface as the hand-rolled fetch client in
 * `openwa-client.ts`. Nothing else in the app changes — callers keep using the
 * interface; only the implementation is swapped.
 *
 * Why this over the hand-rolled client:
 *  - Paths, path-param names, and request bodies are type-checked against the
 *    real gateway spec at compile time (e.g. `/messages/send-text` uses
 *    `{sessionId}` while `/qr` uses `{id}` — a mismatch is a build error, not a
 *    runtime 404 like the ones we hit).
 *  - Errors carry the HTTP status + parsed body instead of a stringly-typed
 *    message, so callers can branch on 401 vs 409 (see `OpenWaApiError`).
 *  - Regenerate types with `pnpm --filter @repo/whatsapp generate:openwa-types`
 *    whenever the gateway version changes — the client stays in lockstep with
 *    the exact version you deploy (no third-party SDK version drift).
 */
import createClient, { type Client } from "openapi-fetch";

import type { paths } from "../openapi/openwa-schema";
import type {
	CreateSessionInput,
	OpenWaChat,
	OpenWaClient,
	OpenWaClientConfig,
	OpenWaHistoryMessage,
	OpenWaMediaKind,
	RegisterWebhookInput,
	SendMediaInput,
	SendTextInput,
} from "./openwa-client";
import type {
	OpenWaPairingCodeResponse,
	OpenWaQrResponse,
	OpenWaSendTextResult,
	OpenWaSession,
} from "./types";

/** Typed error carrying the HTTP status and the parsed error body. */
export class OpenWaApiError extends Error {
	constructor(
		readonly operation: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(`OpenWA ${operation} failed: ${status}`);
		this.name = "OpenWaApiError";
	}
}

/** Throw a typed error on a non-2xx; otherwise return the (typed) body. */
function unwrap<T>(
	operation: string,
	result: { data?: T; error?: unknown; response: Response },
): T {
	if (!result.response.ok || result.error !== undefined) {
		throw new OpenWaApiError(operation, result.response.status, result.error);
	}
	return result.data as T;
}

const MEDIA_PATH = {
	image: "/api/sessions/{sessionId}/messages/send-image",
	video: "/api/sessions/{sessionId}/messages/send-video",
	audio: "/api/sessions/{sessionId}/messages/send-audio",
	document: "/api/sessions/{sessionId}/messages/send-document",
} as const satisfies Record<OpenWaMediaKind, keyof paths>;

export class OpenWaOpenApiClient implements OpenWaClient {
	private readonly api: Client<paths>;

	constructor(config: OpenWaClientConfig) {
		// Spec paths already include `/api`, so baseUrl is the gateway root.
		this.api = createClient<paths>({
			baseUrl: config.baseUrl.replace(/\/$/, ""),
			headers: { "X-API-Key": config.apiKey },
		});
	}

	async createSession(input: CreateSessionInput): Promise<OpenWaSession> {
		const r = await this.api.POST("/api/sessions", { body: { name: input.name } });
		return unwrap("createSession", r) as OpenWaSession;
	}

	async listSessions(): Promise<OpenWaSession[]> {
		const r = await this.api.GET("/api/sessions");
		return unwrap("listSessions", r) as OpenWaSession[];
	}

	async getSession(id: string): Promise<OpenWaSession> {
		const r = await this.api.GET("/api/sessions/{id}", { params: { path: { id } } });
		return unwrap("getSession", r) as OpenWaSession;
	}

	async deleteSession(id: string): Promise<void> {
		unwrap("deleteSession", await this.api.DELETE("/api/sessions/{id}", { params: { path: { id } } }));
	}

	async startSession(id: string): Promise<void> {
		unwrap("startSession", await this.api.POST("/api/sessions/{id}/start", { params: { path: { id } } }));
	}

	async stopSession(id: string): Promise<void> {
		unwrap("stopSession", await this.api.POST("/api/sessions/{id}/stop", { params: { path: { id } } }));
	}

	async getQr(id: string): Promise<OpenWaQrResponse> {
		const r = await this.api.GET("/api/sessions/{id}/qr", { params: { path: { id } } });
		return unwrap("getQr", r) as OpenWaQrResponse;
	}

	async requestPairingCode(id: string, phoneNumber: string): Promise<OpenWaPairingCodeResponse> {
		const r = await this.api.POST("/api/sessions/{id}/pairing-code", {
			params: { path: { id } },
			body: { phoneNumber },
		});
		return unwrap("requestPairingCode", r) as OpenWaPairingCodeResponse;
	}

	async getChats(id: string): Promise<OpenWaChat[]> {
		const r = await this.api.GET("/api/sessions/{id}/chats", { params: { path: { id } } });
		// NOTE (spec gap the typed client surfaced): the gateway's OpenAPI does not
		// document a response body for this endpoint, so `data` is typed `undefined`.
		// The runtime payload exists — cast via `unknown`. Fix upstream by annotating
		// the response schema in OpenWA, then this cast disappears.
		return unwrap("getChats", r) as unknown as OpenWaChat[];
	}

	async getChatHistory(
		id: string,
		chatId: string,
		limit = 50,
		includeMedia = false,
	): Promise<OpenWaHistoryMessage[]> {
		const r = await this.api.GET("/api/sessions/{sessionId}/messages/{chatId}/history", {
			params: { path: { sessionId: id, chatId }, query: { limit, includeMedia } },
		});
		// Same spec gap as getChats — no documented response schema upstream.
		return unwrap("getChatHistory", r) as unknown as OpenWaHistoryMessage[];
	}

	async sendText(id: string, input: SendTextInput): Promise<OpenWaSendTextResult> {
		const r = await this.api.POST("/api/sessions/{sessionId}/messages/send-text", {
			params: { path: { sessionId: id } },
			body: { chatId: input.chatId, text: input.text },
		});
		return unwrap("sendText", r) as OpenWaSendTextResult;
	}

	async sendMedia(
		id: string,
		kind: OpenWaMediaKind,
		input: SendMediaInput,
	): Promise<OpenWaSendTextResult> {
		const r = await this.api.POST(MEDIA_PATH[kind], {
			params: { path: { sessionId: id } },
			body: {
				chatId: input.chatId,
				...(input.url ? { url: input.url } : {}),
				...(input.base64 ? { base64: input.base64 } : {}),
				...(input.mimetype ? { mimetype: input.mimetype } : {}),
				...(input.filename ? { filename: input.filename } : {}),
				...(input.caption ? { caption: input.caption } : {}),
			},
		});
		return unwrap("sendMedia", r) as OpenWaSendTextResult;
	}

	async registerWebhook(id: string, input: RegisterWebhookInput): Promise<unknown> {
		// NOTE (spec BUGS the typed client surfaced on this one endpoint): the gateway's
		// OpenAPI mis-annotates the webhook body — `events` is typed as a single enum
		// value (it's an ARRAY at runtime, per the webhooks guide) and `filters` is
		// over-constrained. Cast the whole body until OpenWA's spec is corrected; every
		// OTHER endpoint here is fully type-checked with no casts.
		const body = {
			url: input.url,
			events: input.events,
			secret: input.secret,
			...(input.filters ? { filters: input.filters } : {}),
		};
		const r = await this.api.POST("/api/sessions/{sessionId}/webhooks", {
			params: { path: { sessionId: id } },
			body: body as unknown as never,
		});
		return unwrap("registerWebhook", r);
	}
}

/**
 * Factory mirroring `createOpenWaClient`, but backed by the OpenAPI-generated
 * client. Note the baseUrl: spec paths already carry `/api`, so we pass the
 * gateway ROOT here (no `/api` suffix) — unlike the hand-rolled client.
 */
export function createOpenWaOpenApiClient(config?: Partial<OpenWaClientConfig>): OpenWaClient {
	const baseUrl = config?.baseUrl ?? process.env.OPENWA_BASE_URL;
	const apiKey = config?.apiKey ?? process.env.OPENWA_API_KEY;
	if (!baseUrl) {
		throw new Error("OPENWA_BASE_URL is not configured.");
	}
	if (!apiKey) {
		throw new Error("OPENWA_API_KEY is not configured.");
	}
	return new OpenWaOpenApiClient({ baseUrl, apiKey });
}
