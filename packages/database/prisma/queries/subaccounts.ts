import { db } from "../client";
import type { Prisma } from "../generated/client";

// ─── Subaccount (a GHL location under an agency Organization) ─────────────────

export async function createSubaccount(data: {
	organizationId: string;
	name: string;
	provisioningSource?: "manual" | "ghl";
	ghlLocationId?: string | null;
}) {
	return db.subaccount.create({
		data: {
			organizationId: data.organizationId,
			name: data.name,
			provisioningSource: data.provisioningSource ?? "manual",
			ghlLocationId: data.ghlLocationId ?? undefined,
		},
	});
}

/** All subaccounts for an agency, newest first. */
export async function listSubaccounts(organizationId: string) {
	return db.subaccount.findMany({
		where: { organizationId },
		orderBy: { createdAt: "asc" },
	});
}

export async function countSubaccounts(organizationId: string) {
	return db.subaccount.count({ where: { organizationId } });
}

/** A subaccount scoped to its owning agency (membership is checked upstream). */
export async function getSubaccount(organizationId: string, id: string) {
	return db.subaccount.findFirst({ where: { id, organizationId } });
}

export async function getSubaccountByLocationId(ghlLocationId: string) {
	return db.subaccount.findUnique({ where: { ghlLocationId } });
}

/** Unscoped lookup by id — callers must verify membership of `organizationId`. */
export async function getSubaccountById(id: string) {
	return db.subaccount.findUnique({ where: { id } });
}

/** The agency's default (oldest) subaccount — the single-subaccount fallback. */
export async function getDefaultSubaccount(organizationId: string) {
	return db.subaccount.findFirst({
		where: { organizationId },
		orderBy: { createdAt: "asc" },
	});
}

export async function updateSubaccount(
	organizationId: string,
	id: string,
	data: Partial<{
		name: string;
		status: string;
		ghlLocationId: string | null;
		whiteLabel: Record<string, unknown>;
	}>,
) {
	const result = await db.subaccount.updateMany({
		where: { id, organizationId },
		data: {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.status !== undefined ? { status: data.status } : {}),
			...(data.ghlLocationId !== undefined ? { ghlLocationId: data.ghlLocationId } : {}),
			...(data.whiteLabel !== undefined
				? { whiteLabel: data.whiteLabel as Prisma.InputJsonValue }
				: {}),
		},
	});
	if (result.count === 0) {
		return null;
	}
	return getSubaccount(organizationId, id);
}

export async function deleteSubaccount(organizationId: string, id: string) {
	const result = await db.subaccount.deleteMany({ where: { id, organizationId } });
	return result.count > 0;
}

/**
 * Aggregate connection stats per subaccount for the agency Control Panel:
 * total numbers and how many are currently "ready".
 */
export async function listSubaccountsWithStats(organizationId: string) {
	const subaccounts = await db.subaccount.findMany({
		where: { organizationId },
		orderBy: { createdAt: "asc" },
		include: {
			goHighLevelConnection: { select: { id: true, locationId: true, needsReconnect: true } },
			_count: { select: { whatsAppSessions: true } },
			whatsAppSessions: { select: { status: true } },
		},
	});
	return subaccounts.map((subaccount) => {
		const online = subaccount.whatsAppSessions.filter((s) => s.status === "ready").length;
		const total = subaccount.whatsAppSessions.length;
		return {
			id: subaccount.id,
			name: subaccount.name,
			status: subaccount.status,
			provisioningSource: subaccount.provisioningSource,
			ghlLocationId: subaccount.ghlLocationId,
			whiteLabel: subaccount.whiteLabel,
			createdAt: subaccount.createdAt,
			ghlConnected: Boolean(subaccount.goHighLevelConnection),
			connectionsTotal: total,
			connectionsOnline: online,
			connectionsOffline: total - online,
		};
	});
}
