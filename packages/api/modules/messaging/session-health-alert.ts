import {
	getOrganizationById,
	getSubaccount,
	getWhatsAppSession,
	listOrganizationMembers,
} from "@repo/database";
import { logger } from "@repo/logs";
import { createNotification, NOTIFICATION_TYPES } from "@repo/notifications";
import type { OpenWaSessionHealthEvent } from "@repo/whatsapp";

/**
 * Org roles alerted when a WhatsApp number drops — the operators who can act on
 * it. Falls back to every member when an org has no owner/admin rows, so the
 * alert is never silently lost.
 */
const ALERT_ROLES = new Set(["owner", "admin"]);

/** Human phrasing for why the number can no longer deliver. */
function reasonPhrase(reason: OpenWaSessionHealthEvent["reason"]): string {
	return reason === "logged_out" ? "logged out and needs a new QR scan" : "disconnected";
}

/**
 * A WhatsApp session went down — notify the subaccount's operators (in-app +
 * email, per each user's preferences) so a silent drop doesn't strand outbound
 * messages the way the Among the Nations outage did. The webhook fires this once
 * per down-episode (see `alertIfSessionWentDown`).
 *
 * Best-effort by contract: never throws. A failure here must not fail the OpenWA
 * webhook, which would trigger gateway retries.
 */
export async function notifySessionDown(event: OpenWaSessionHealthEvent): Promise<void> {
	try {
		const [session, subaccount, organization, members] = await Promise.all([
			getWhatsAppSession(event.subaccountId, event.sessionId),
			getSubaccount(event.organizationId, event.subaccountId),
			getOrganizationById(event.organizationId),
			listOrganizationMembers(event.organizationId),
		]);

		const numberLabel = session?.label?.trim() || session?.phone || "A WhatsApp number";
		const subaccountName = subaccount?.name ?? "your account";
		const slug = organization?.slug ?? null;
		const link = slug ? `/${slug}/whatsapp/${event.subaccountId}` : null;
		const phrase = reasonPhrase(event.reason);

		const data = {
			headline: "WhatsApp connection lost",
			title: `${numberLabel} ${phrase}`,
			message: `${numberLabel} for ${subaccountName} ${phrase}. Reconnect it to resume sending — messages sent from GHL in the meantime are marked failed.`,
			subaccountId: event.subaccountId,
			sessionId: event.sessionId,
			reason: event.reason,
			numberLabel,
			phone: session?.phone ?? null,
		};

		const operators = members.filter((member) => ALERT_ROLES.has(member.role));
		const recipients = operators.length > 0 ? operators : members;

		await Promise.all(
			recipients.map((member) =>
				createNotification({
					userId: member.userId,
					type: NOTIFICATION_TYPES.WHATSAPP_SESSION_DISCONNECTED,
					link,
					data,
				}).catch((error) => {
					// One user's notification failing must not drop the others.
					logger.error(error, {
						ctx: "messaging.sessionHealth.notify",
						userId: member.userId,
						sessionId: event.sessionId,
					});
				}),
			),
		);

		logger.info("WhatsApp session down; alerted operators", {
			ctx: "messaging.sessionHealth",
			subaccountId: event.subaccountId,
			sessionId: event.sessionId,
			reason: event.reason,
			recipients: recipients.length,
		});
	} catch (error) {
		logger.error(error, {
			ctx: "messaging.sessionHealth",
			subaccountId: event.subaccountId,
			sessionId: event.sessionId,
		});
	}
}
