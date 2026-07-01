import { db } from "../client";

// ─── GoHighLevel Connection ───────────────────────────────────────────────────

export async function getGhlConnection(organizationId: string) {
	return db.goHighLevelConnection.findUnique({
		where: { organizationId },
	});
}

export async function getGhlConnectionByLocationId(locationId: string) {
	return db.goHighLevelConnection.findFirst({
		where: { locationId },
	});
}

export async function upsertGhlConnection(data: {
	organizationId: string;
	locationId: string;
	companyId?: string | null;
	userId?: string | null;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
	conversationProviderId?: string | null;
}) {
	return db.goHighLevelConnection.upsert({
		where: { organizationId: data.organizationId },
		create: {
			organizationId: data.organizationId,
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
	organizationId: string,
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
		where: { organizationId },
		data,
	});
}

export async function setGhlNeedsReconnect(organizationId: string) {
	return db.goHighLevelConnection.update({
		where: { organizationId },
		data: { needsReconnect: true },
	});
}

export async function deleteGhlConnection(organizationId: string) {
	return db.goHighLevelConnection.delete({ where: { organizationId } });
}
