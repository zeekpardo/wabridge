/**
 * Next.js server startup hook. Runs once when the Node server boots (not during
 * build, and not in the edge runtime).
 */
export async function register(): Promise<void> {
	// Only the Node.js server runtime can talk to OpenWA / the database.
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	// Background self-heal: OpenWA drops sessions to disconnected on restart, so
	// reconcile on a timer to re-start them from persisted creds — no external
	// cron required. No-op when OPENWA_BASE_URL is unset or the interval is 0.
	const { startReconcileLoop } = await import("@repo/whatsapp");
	startReconcileLoop();
}
