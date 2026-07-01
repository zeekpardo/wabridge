import type { GHLTokenResponse } from "../gohighlevel/types";
import type { OAuthTokens, RefreshFunction } from "./types";

function ghlTokensToOAuth(tokens: GHLTokenResponse): OAuthTokens {
	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
	};
}

/** Wrap `refreshGhlToken` into a normalized `RefreshFunction`. */
export function createGhlRefreshFn(
	refreshGhlToken: (refreshToken: string) => Promise<GHLTokenResponse>,
): RefreshFunction {
	return async (refreshToken) => ghlTokensToOAuth(await refreshGhlToken(refreshToken));
}
