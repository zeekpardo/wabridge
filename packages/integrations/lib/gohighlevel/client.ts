import type { TokenManager } from "../token-refresh/token-manager";
import { refreshGhlToken } from "./oauth";
import type {
	GHLApiResponse,
	GHLContact,
	GHLContactCreateInput,
	GHLContactUpdateInput,
	GHLConversation,
	GHLCustomFieldDefinition,
	GHLInboundMessageInput,
	GHLLocation,
	GHLMessageResponse,
	GHLOutboundMessageInput,
	GHLTokenResponse,
	GHLUpdateMessageStatusInput,
} from "./types";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const MAX_RETRIES = 3;
const CALL_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GoHighLevelClientOptions {
	accessToken: string;
	refreshToken: string;
	locationId: string;
	onTokenRefreshed?: (tokens: GHLTokenResponse) => Promise<void>;
	tokenManager?: TokenManager;
}

export class GoHighLevelClient {
	private accessToken: string;
	private refreshToken: string;
	readonly locationId: string;
	private onTokenRefreshed?: (tokens: GHLTokenResponse) => Promise<void>;
	private tokenManager?: TokenManager;

	constructor(options: GoHighLevelClientOptions) {
		this.accessToken = options.accessToken;
		this.refreshToken = options.refreshToken;
		this.locationId = options.locationId;
		this.onTokenRefreshed = options.onTokenRefreshed;
		this.tokenManager = options.tokenManager;
	}

	private async request<T>(path: string, options: RequestInit = {}, retries = 0): Promise<T> {
		const url = path.startsWith("http") ? path : `${GHL_API_BASE}${path}`;

		// Proactive refresh via TokenManager
		const token = this.tokenManager
			? await this.tokenManager.getValidAccessToken()
			: this.accessToken;

		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Version: API_VERSION,
				...(options.headers as Record<string, string> | undefined),
			},
		});

		if (response.status === 401 && retries < 1) {
			if (this.tokenManager) {
				const freshToken = await this.tokenManager.handleUnauthorized();
				this.accessToken = freshToken;
				return this.request<T>(path, options, retries + 1);
			}
			// Legacy inline refresh path
			const newTokens = await refreshGhlToken(this.refreshToken);
			this.accessToken = newTokens.access_token;
			this.refreshToken = newTokens.refresh_token;
			if (this.onTokenRefreshed) {
				await this.onTokenRefreshed(newTokens);
			}
			return this.request<T>(path, options, retries + 1);
		}

		if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
			if (retries < MAX_RETRIES) {
				const delay = 5500 * 2 ** retries;
				await sleep(delay);
				return this.request<T>(path, options, retries + 1);
			}
		}

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`GHL API error ${response.status}: ${text}`);
		}

		if (response.status === 204) {
			return undefined as unknown as T;
		}

		return response.json() as Promise<T>;
	}

	/**
	 * Proactively refresh the access token. Call before long-running work
	 * so that the worker always begins with fresh credentials.
	 */
	async refreshNow(): Promise<void> {
		if (this.tokenManager) {
			const token = await this.tokenManager.getValidAccessToken();
			this.accessToken = token;
			return;
		}
		const newTokens = await refreshGhlToken(this.refreshToken);
		this.accessToken = newTokens.access_token;
		this.refreshToken = newTokens.refresh_token;
		if (this.onTokenRefreshed) {
			await this.onTokenRefreshed(newTokens);
		}
	}

	// ─── Contacts ───────────────────────────────────────────────────────────────

	async getContact(contactId: string): Promise<GHLContact> {
		const res = await this.request<GHLApiResponse<GHLContact>>(`/contacts/${contactId}`);
		return res.contact as GHLContact;
	}

	async createContact(data: GHLContactCreateInput): Promise<GHLContact> {
		await sleep(CALL_DELAY_MS);
		const res = await this.request<GHLApiResponse<GHLContact>>("/contacts/", {
			method: "POST",
			body: JSON.stringify(data),
		});
		return res.contact as GHLContact;
	}

	async updateContact(contactId: string, data: GHLContactUpdateInput): Promise<GHLContact> {
		await sleep(CALL_DELAY_MS);
		const res = await this.request<GHLApiResponse<GHLContact>>(`/contacts/${contactId}`, {
			method: "PUT",
			body: JSON.stringify(data),
		});
		return res.contact as GHLContact;
	}

	async searchContactsByEmail(email: string): Promise<GHLContact[]> {
		const params = new URLSearchParams({
			locationId: this.locationId,
			query: email,
		});
		const res = await this.request<GHLApiResponse<GHLContact>>(`/contacts/?${params.toString()}`);
		return (res.contacts ?? []).filter((c) => c.email?.toLowerCase() === email.toLowerCase());
	}

	async searchContactsByPhone(phone: string): Promise<GHLContact[]> {
		const params = new URLSearchParams({
			locationId: this.locationId,
			query: phone,
		});
		const res = await this.request<GHLApiResponse<GHLContact>>(`/contacts/?${params.toString()}`);
		// Normalize phone for comparison
		const normalized = phone.replace(/\D/g, "");
		return (res.contacts ?? []).filter((c) => c.phone?.replace(/\D/g, "").includes(normalized));
	}

	/**
	 * Add tags to a contact using the dedicated tags endpoint.
	 * POST /contacts/:contactId/tags — idempotent, won't duplicate existing tags.
	 */
	async addTags(contactId: string, tags: string[]): Promise<{ tags: string[] }> {
		return this.request<{ tags: string[] }>(`/contacts/${contactId}/tags`, {
			method: "POST",
			body: JSON.stringify({ tags }),
		});
	}

	async upsertContact(data: {
		name?: string;
		firstName?: string;
		lastName?: string;
		email?: string;
		phone?: string;
		locationId: string;
		source?: string;
	}): Promise<GHLContact> {
		await sleep(CALL_DELAY_MS);
		const res = await this.request<{ contact: GHLContact }>("/contacts/upsert", {
			method: "POST",
			body: JSON.stringify(data),
		});
		return res.contact;
	}

	async getCustomFields(): Promise<GHLCustomFieldDefinition[]> {
		const res = await this.request<{ customFields: GHLCustomFieldDefinition[] }>(
			`/locations/${this.locationId}/customFields`,
		);
		return res.customFields ?? [];
	}

	// ─── Location ───────────────────────────────────────────────────────────────

	async getLocation(): Promise<GHLLocation> {
		const res = await this.request<{ location: GHLLocation }>(`/locations/${this.locationId}`);
		return res.location;
	}

	// ─── Conversations / Messages ────────────────────────────────────────────────

	/**
	 * Find an existing conversation for a contact, creating one if none exists.
	 * GHL maintains one conversation per contact (per the marketplace docs), so
	 * the first match is the thread.
	 * Search: GET /conversations/search?locationId=&contactId=
	 * Create: POST /conversations/ with { locationId, contactId }
	 */
	async getOrCreateConversation(params: {
		locationId: string;
		contactId: string;
	}): Promise<GHLConversation> {
		const { locationId, contactId } = params;

		const searchParams = new URLSearchParams({
			locationId,
			contactId,
		});
		const search = await this.request<{ conversations?: GHLConversation[] }>(
			`/conversations/search?${searchParams.toString()}`,
		);
		const existing = search.conversations?.[0];
		if (existing) {
			return existing;
		}

		await sleep(CALL_DELAY_MS);
		const created = await this.request<
			{ conversation?: GHLConversation } & Partial<GHLConversation>
		>("/conversations/", {
			method: "POST",
			body: JSON.stringify({ locationId, contactId }),
		});
		return created.conversation ?? (created as GHLConversation);
	}

	/**
	 * Record an inbound message (WhatsApp → GHL) in a conversation. Per the
	 * marketplace Conversation Providers docs, the payload is keyed on
	 * `conversationId` (not contact/location) — resolve it first via
	 * {@link getOrCreateConversation}. `conversationProviderId` stays omitted for
	 * the SMS-replace provider (Option B).
	 * POST /conversations/messages/inbound
	 */
	async postInboundMessage(input: GHLInboundMessageInput): Promise<GHLMessageResponse> {
		return this.request<GHLMessageResponse>("/conversations/messages/inbound", {
			method: "POST",
			body: JSON.stringify({
				type: input.type,
				conversationId: input.conversationId,
				message: input.message,
				...(input.conversationProviderId
					? { conversationProviderId: input.conversationProviderId }
					: {}),
				...(input.attachments?.length ? { attachments: input.attachments } : {}),
				...(input.date ? { date: input.date } : {}),
			}),
		});
	}

	/**
	 * Record an outbound message that this provider sent on GHL's behalf, so the
	 * conversation timeline shows the sent message. This is distinct from the
	 * standard "send message" flow (which asks GHL to deliver); here the provider
	 * delivered the message itself and is only writing the record back. Keyed on
	 * `conversationId`, same as the inbound record.
	 * POST /conversations/messages/outbound
	 */
	async postOutboundMessageRecord(input: GHLOutboundMessageInput): Promise<GHLMessageResponse> {
		return this.request<GHLMessageResponse>("/conversations/messages/outbound", {
			method: "POST",
			body: JSON.stringify({
				type: input.type,
				conversationId: input.conversationId,
				message: input.message,
				...(input.conversationProviderId
					? { conversationProviderId: input.conversationProviderId }
					: {}),
				...(input.attachments?.length ? { attachments: input.attachments } : {}),
				...(input.date ? { date: input.date } : {}),
			}),
		});
	}

	/**
	 * Update the delivery status of a message (delivered | read | failed |
	 * pending). Only the conversation-provider app's token may do this (per the
	 * marketplace docs), which is us.
	 * PUT /conversations/messages/{messageId}/status
	 */
	async updateMessageStatus(input: GHLUpdateMessageStatusInput): Promise<void> {
		await this.request(`/conversations/messages/${input.messageId}/status`, {
			method: "PUT",
			body: JSON.stringify({
				status: input.status,
				...(input.error ? { error: input.error } : {}),
			}),
		});
	}
}
