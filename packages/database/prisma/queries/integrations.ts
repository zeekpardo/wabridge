import { db } from "../client";

// ─── GoHighLevel Connection (one per subaccount / GHL location) ───────────────

export async function getGhlConnection(subaccountId: string) {
	return db.goHighLevelConnection.findUnique({
		where: { subaccountId },
	});
}

export async function getGhlConnectionByLocationId(locationId: string) {
	return db.goHighLevelConnection.findFirst({
		where: { locationId },
	});
}

export async function upsertGhlConnection(data: {
	subaccountId: string;
	locationId: string;
	companyId?: string | null;
	userId?: string | null;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
	conversationProviderId?: string | null;
}) {
	return db.goHighLevelConnection.upsert({
		where: { subaccountId: data.subaccountId },
		create: {
			subaccountId: data.subaccountId,
			locationId: data.locationId,
			companyId: data.companyId,
			userId: data.userId,
			accessToken: data.accessToken,
			refreshToken: data.refreshToken,
			tokenExpiresAt: data.tokenExpiresAt,
			conversationProviderId: data.conversationProviderId,
			needsReconnect: false,
		},
		update: {
			locationId: data.locationId,
			companyId: data.companyId,
			userId: data.userId,
			accessToken: data.accessToken,
			refreshToken: data.refreshToken,
			tokenExpiresAt: data.tokenExpiresAt,
			conversationProviderId: data.conversationProviderId,
			needsReconnect: false,
		},
	});
}

export async function updateGhlConnection(
	subaccountId: string,
	data: Partial<{
		accessToken: string;
		refreshToken: string;
		tokenExpiresAt: Date;
		conversationProviderId: string | null;
		webhooksEnabled: boolean;
		firstSyncInProgress: boolean;
		needsReconnect: boolean;
		syncConfig: string | null;
	}>,
) {
	return db.goHighLevelConnection.update({
		where: { subaccountId },
		data,
	});
}

export async function setGhlNeedsReconnect(subaccountId: string) {
	return db.goHighLevelConnection.update({
		where: { subaccountId },
		data: { needsReconnect: true },
	});
}

export async function deleteGhlConnection(subaccountId: string) {
	return db.goHighLevelConnection.delete({ where: { subaccountId } });
}
