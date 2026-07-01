/** Normalized OAuth tokens shared across all providers. */
export interface OAuthTokens {
	accessToken: string;
	refreshToken: string;
	/** Absolute expiry time. `null` when the provider doesn't return `expires_in`. */
	expiresAt: Date | null;
}

/** Provider-specific refresh function that returns normalized tokens. */
export type RefreshFunction = (refreshToken: string) => Promise<OAuthTokens>;

export interface TokenCallbacks {
	/** Persist freshly refreshed tokens to the database. */
	onTokenRefreshed?: (tokens: OAuthTokens) => Promise<void>;
	/** Called when the refresh token is permanently dead (e.g. `invalid_grant`). */
	onRefreshFailed?: (detail?: string) => Promise<void>;
}

export interface TokenManagerConfig {
	/** Human-readable provider name for log messages and lock keys. */
	provider: string;
	/** Organization ID — scopes the distributed lock. */
	orgId: string;
	/** Initial decrypted access token. */
	accessToken: string;
	/** Initial decrypted refresh token. */
	refreshToken: string;
	/** Known token expiry from DB (may be null if never stored). */
	expiresAt: Date | null;
	/** Provider-specific refresh function. */
	refreshFn: RefreshFunction;
	/** Lifecycle callbacks. */
	callbacks: TokenCallbacks;
	/**
	 * Re-read the connection from DB and return fresh decrypted tokens.
	 * Called when another process won the lock and already refreshed.
	 */
	reloadConnection: () => Promise<OAuthTokens | null>;
}

export class TokenExpiredError extends Error {
	constructor(provider: string) {
		super(`${provider} token expired — reconnection required`);
		this.name = "TokenExpiredError";
	}
}
