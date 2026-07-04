import {
	listAllWhatsAppSessions,
	listWhatsAppSessions,
	updateWhatsAppSession,
} from "@repo/database";
import { logger } from "@repo/logs";

import { createOpenWaClient } from "./openwa-client";

export interface ReconcileSummary {
	checked: number;
	restarted: number;
	needsReconnect: number;
	errors: number;
}

/**
 * Reconcile tracked WhatsApp sessions against their OpenWA worker.
 *
 * OpenWA resets live sessions to DISCONNECTED on reboot (engines are rebuilt in
 * memory), so after a worker restart we must explicitly re-start each session.
 * Baileys auth creds persist on the worker, so a restart reconnects without a
 * new QR. If the worker no longer knows the session at all, we flag it as
 * needing a fresh link. Safe to run repeatedly (idempotent).
 *
 * Pass `subaccountId` to reconcile only that tenant's sessions (used by the
 * embedded UI's on-demand "Reconnect"); omit it for the global cron sweep.
 */
export async function reconcileWhatsAppSessions(subaccountId?: string): Promise<ReconcileSummary> {
	const sessions = subaccountId
		? await listWhatsAppSessions(subaccountId)
		: await listAllWhatsAppSessions();
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
				// Restart (stop -> start), not a bare start: a `failed` session still holds its engine on
				// the worker, so start() alone 400s ("Session is already started") and never recovers. Stop
				// first (ignore "not running" when the worker has no engine, e.g. after its own restart),
				// then start fresh. Reconnects with persisted creds when valid — no QR needed — or emits a
				// fresh QR when the creds are gone (the re-pair case).
				await openwa.stopSession(session.openwaSessionId).catch(() => undefined);
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

/** Default background reconcile cadence: every 2 minutes. */
const DEFAULT_RECONCILE_INTERVAL_MS = 2 * 60 * 1000;
/** Delay before the first pass so it runs shortly after boot, not during it. */
const INITIAL_RECONCILE_DELAY_MS = 15 * 1000;

let reconcileLoopStarted = false;

/**
 * Start an in-process background loop that reconciles all WhatsApp sessions on a
 * timer, so numbers self-heal after an OpenWA restart without anyone opening the
 * app or wiring an external cron. Idempotent — safe to call once per process
 * (e.g. from Next's instrumentation `register()`); repeat calls are no-ops.
 *
 * Cadence is `RECONCILE_INTERVAL_MS` (default 2 min); set it to `0` to disable
 * (e.g. when an external scheduler already hits the cron route). Skips entirely
 * when `OPENWA_BASE_URL` is unset (no worker to reconcile against).
 */
export function startReconcileLoop(): void {
	if (reconcileLoopStarted) {
		return;
	}
	if (!process.env.OPENWA_BASE_URL) {
		return;
	}
	const configured = process.env.RECONCILE_INTERVAL_MS;
	const intervalMs = configured ? Number(configured) : DEFAULT_RECONCILE_INTERVAL_MS;
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
		return;
	}

	reconcileLoopStarted = true;

	async function tick(): Promise<void> {
		try {
			await reconcileWhatsAppSessions();
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.reconcile.loop" });
		}
	}

	logger.info("WhatsApp reconcile loop started", {
		ctx: "whatsapp.reconcile.loop",
		intervalMs,
	});
	setTimeout(() => {
		void tick();
		setInterval(() => void tick(), intervalMs).unref?.();
	}, INITIAL_RECONCILE_DELAY_MS).unref?.();
}
