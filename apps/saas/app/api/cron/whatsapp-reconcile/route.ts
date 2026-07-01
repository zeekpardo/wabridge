import { reconcileWhatsAppSessions } from "@repo/whatsapp";
import { NextResponse } from "next/server";

/**
 * Automated reconciler endpoint. Point a scheduler (Railway cron, external cron,
 * etc.) at `GET /api/cron/whatsapp-reconcile` with `Authorization: Bearer $CRON_SECRET`
 * to re-start any WhatsApp sessions the OpenWA worker dropped after a reboot.
 */
export async function GET(request: Request): Promise<Response> {
	const secret = process.env.CRON_SECRET;

	if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const summary = await reconcileWhatsAppSessions();
	return NextResponse.json(summary);
}
