import { listAllWhatsAppSessions, updateWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";

import { createOpenWaClient } from "./openwa-client";

export interface ReconcileSummary {
	checked: number;
	restarted: number;
	needsReconnect: number;
	errors: number;
}

/**
 * Reconcile every tracked WhatsApp session against its OpenWA worker.
 *
 * OpenWA resets live sessions to DISCONNECTED on reboot (engines are rebuilt in
 * memory), so after a worker restart we must explicitly re-start each session.
 * Baileys auth creds persist on the worker, so a restart reconnects without a
 * new QR. If the worker no longer knows the session at all, we flag it as
 * needing a fresh link. Safe to run repeatedly (idempotent).
 */
export async function reconcileWhatsAppSessions(): Promise<ReconcileSummary> {
	const sessions = await listAllWhatsAppSessions();
	const openwa = createOpenWaClient();
	const summary: ReconcileSummary = { checked: 0, restarted: 0, needsReconnect: 0, errors: 0 };

	for (const session of sessions) {
		summary.checked++;

		try {
			let live: Awaited<ReturnType<typeof openwa.getSession>> | null;
			try {
				live = await openwa.getSession(session.openwaSessionId);
			} catch {
				live = null; // unreachable or unknown to the worker
			}

			if (!live) {
				await updateWhatsAppSession(session.subaccountId, session.id, {
					status: "disconnected",
					needsQr: true,
				});
				summary.needsReconnect++;
				continue;
			}

			if (live.status === "ready") {
				if (session.status !== "ready") {
					await updateWhatsAppSession(session.subaccountId, session.id, { status: "ready" });
				}
				continue;
			}

			if (live.status === "disconnected" || live.status === "failed") {
				// Reconnect using persisted creds — no QR needed in the common case.
				await openwa.startSession(session.openwaSessionId);
				await updateWhatsAppSession(session.subaccountId, session.id, {
					status: "authenticating",
				});
				summary.restarted++;
				continue;
			}

			// Any other transient status (qr_ready, initializing, …) — just sync it.
			if (live.status !== session.status) {
				await updateWhatsAppSession(session.subaccountId, session.id, { status: live.status });
			}
		} catch (error) {
			summary.errors++;
			logger.error(error, { ctx: "whatsapp.reconcile", sessionId: session.id });
		}
	}

	logger.info("WhatsApp reconcile complete", { ctx: "whatsapp.reconcile", ...summary });
	return summary;
}
