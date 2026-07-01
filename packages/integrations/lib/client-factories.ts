import { getGhlConnection, setGhlNeedsReconnect, updateGhlConnection } from "@repo/database";

import { decrypt, encrypt } from "./crypto";
import { GoHighLevelClient } from "./gohighlevel/client";
import { refreshGhlToken } from "./gohighlevel/oauth";
import { createGhlRefreshFn } from "./token-refresh/adapters";
import { TokenManager } from "./token-refresh/token-manager";

/**
 * Load the GoHighLevelConnection for an organization, decrypt its tokens, and
 * return a fully wired GoHighLevelClient. The client's TokenManager persists
 * refreshed tokens back to the DB and flags the connection for reconnect when
 * the refresh token is permanently dead.
 *
 * Returns `null` when no connection exists for the organization.
 */
export async function createGoHighLevelClient(
	organizationId: string,
): Promise<GoHighLevelClient | null> {
	const connection = await getGhlConnection(organizationId);
	if (!connection) {
		return null;
	}

	const tokenManager = new TokenManager({
		provider: "ghl",
		orgId: organizationId,
		accessToken: decrypt(connection.accessToken),
		refreshToken: decrypt(connection.refreshToken),
		expiresAt: connection.tokenExpiresAt ?? null,
		refreshFn: createGhlRefreshFn(refreshGhlToken),
		callbacks: {
			onTokenRefreshed: async (tokens) => {
				await updateGhlConnection(organizationId, {
					accessToken: encrypt(tokens.accessToken),
					refreshToken: encrypt(tokens.refreshToken),
					...(tokens.expiresAt ? { tokenExpiresAt: tokens.expiresAt } : {}),
				});
			},
			onRefreshFailed: async () => {
				await setGhlNeedsReconnect(organizationId);
			},
		},
		reloadConnection: async () => {
			const fresh = await getGhlConnection(organizationId);
			if (!fresh) return null;
			return {
				accessToken: decrypt(fresh.accessToken),
				refreshToken: decrypt(fresh.refreshToken),
				expiresAt: fresh.tokenExpiresAt ?? null,
			};
		},
	});

	return new GoHighLevelClient({
		accessToken: decrypt(connection.accessToken),
		refreshToken: decrypt(connection.refreshToken),
		locationId: connection.locationId,
		tokenManager,
	});
}
