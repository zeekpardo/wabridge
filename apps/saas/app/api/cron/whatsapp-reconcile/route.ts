import { reconcileWhatsAppSessions } from "@repo/whatsapp";
import { NextResponse } from "next/server";

/**
 * Automated reconciler endpoint. Point a scheduler at
 * `/api/cron/whatsapp-reconcile` with `Authorization: Bearer $CRON_SECRET` to
 * re-start any WhatsApp sessions the OpenWA worker dropped after a reboot.
 * Accepts GET and POST so it works with any scheduler.
 *
 * Note: the app also self-heals via an in-process reconcile loop (see
 * `startReconcileLoop`), so this route is a manual/backup trigger.
 */
async function handle(request: Request): Promise<Response> {
	const secret = process.env.CRON_SECRET;

	if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const summary = await reconcileWhatsAppSessions();
	return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
