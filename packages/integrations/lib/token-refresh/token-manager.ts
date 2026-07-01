import { withDistributedLock } from "./redis-lock";
import type { OAuthTokens, TokenManagerConfig } from "./types";
import { TokenExpiredError } from "./types";

/** How far before expiry we proactively refresh (5 minutes). */
const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class TokenManager {
	private accessToken: string;
	private refreshToken: string;
	private expiresAt: Date | null;
	private readonly provider: string;
	private readonly orgId: string;
	private readonly refreshFn: TokenManagerConfig["refreshFn"];
	private readonly callbacks: TokenManagerConfig["callbacks"];
	private readonly reloadConnection: TokenManagerConfig["reloadConnection"];

	/** In-process mutex to prevent concurrent refreshes within the same process. */
	private refreshPromise: Promise<void> | null = null;

	constructor(config: TokenManagerConfig) {
		this.provider = config.provider;
		this.orgId = config.orgId;
		this.accessToken = config.accessToken;
		this.refreshToken = config.refreshToken;
		this.expiresAt = config.expiresAt;
		this.refreshFn = config.refreshFn;
		this.callbacks = config.callbacks;
		this.reloadConnection = config.reloadConnection;
	}

	/** Get a valid access token, proactively refreshing if close to expiry. */
	async getValidAccessToken(): Promise<string> {
		if (this.isExpiringSoon()) {
			await this.performLockedRefresh();
		}
		return this.accessToken;
	}

	/** Handle a 401 response by force-refreshing. */
	async handleUnauthorized(): Promise<string> {
		await this.performLockedRefresh();
		return this.accessToken;
	}

	/** Current access token without any refresh check. */
	get currentAccessToken(): string {
		return this.accessToken;
	}

	/** Current refresh token. */
	get currentRefreshToken(): string {
		return this.refreshToken;
	}

	private isExpiringSoon(): boolean {
		if (!this.expiresAt) return false;
		return Date.now() + PROACTIVE_REFRESH_BUFFER_MS >= this.expiresAt.getTime();
	}

	private async performLockedRefresh(): Promise<void> {
		// In-process dedup: if a refresh is already in flight, wait for it
		if (this.refreshPromise) {
			await this.refreshPromise;
			return;
		}

		this.refreshPromise = this.doLockedRefresh();
		try {
			await this.refreshPromise;
		} finally {
			this.refreshPromise = null;
		}
	}

	private async doLockedRefresh(): Promise<void> {
		const lockKey = `token-refresh:${this.provider}:${this.orgId}`;

		const lockResult = await withDistributedLock(lockKey, async () => {
			return this.executeRefresh();
		});

		if (lockResult.executed) {
			// We won the lock and refreshed successfully
			return;
		}

		// Another process refreshed — reload from DB
		const fresh = await this.reloadConnection();
		if (fresh) {
			this.accessToken = fresh.accessToken;
			this.refreshToken = fresh.refreshToken;
			this.expiresAt = fresh.expiresAt;
		}
	}

	private async executeRefresh(): Promise<void> {
		// Reload from DB to get the latest refresh token (another process may have rotated it)
		const inMemoryRefreshToken = this.refreshToken;
		const fresh = await this.reloadConnection();
		let tokenWasStale = false;
		if (fresh) {
			tokenWasStale = fresh.refreshToken !== inMemoryRefreshToken;
			this.accessToken = fresh.accessToken;
			this.refreshToken = fresh.refreshToken;
			this.expiresAt = fresh.expiresAt;

			// If the reloaded token is still valid, skip the refresh entirely
			if (fresh.expiresAt && !this.isExpiringSoon()) {
				return;
			}
		}

		try {
			const tokens = await this.refreshFn(this.refreshToken);
			this.applyTokens(tokens);
			if (this.callbacks.onTokenRefreshed) {
				await this.callbacks.onTokenRefreshed(tokens);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("invalid_grant")) {
				const detail = [
					`error=${msg}`,
					`provider=${this.provider}`,
					`tokenWasStale=${tokenWasStale}`,
					`expiresAt=${this.expiresAt?.toISOString() ?? "null"}`,
					`refreshTokenPrefix=${this.refreshToken.slice(0, 8)}...`,
				].join(", ");

				if (this.callbacks.onRefreshFailed) {
					await this.callbacks.onRefreshFailed(detail).catch(() => {});
				}
				throw new TokenExpiredError(this.provider);
			}
			throw err;
		}
	}

	private applyTokens(tokens: OAuthTokens): void {
		this.accessToken = tokens.accessToken;
		this.refreshToken = tokens.refreshToken;
		this.expiresAt = tokens.expiresAt;
	}
}
