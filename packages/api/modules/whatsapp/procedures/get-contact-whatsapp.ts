import {
	getConversation,
	getDefaultSession,
	getWhatsAppSession,
	listWhatsAppSessions,
} from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface ContactWhatsappInfo {
	/** Best-effort WhatsApp profile picture url. */
	avatarUrl: string | null;
	/** The contact's name as WhatsApp knows it (self-set pushname / address book). */
	whatsappName: string | null;
}

/**
 * Best-effort fetch of a contact's WhatsApp profile picture. Resolves the owning session (pinned
 * active number, else the subaccount default) and asks OpenWA for the avatar url. Any error yields
 * null — this never fails the panel.
 */
async function resolveAvatarUrl(
	subaccountId: string,
	chatId: string,
	activeSessionId: string | null,
): Promise<string | null> {
	try {
		const session = activeSessionId
			? await getWhatsAppSession(subaccountId, activeSessionId)
			: await getDefaultSession(subaccountId);
		if (!session) {
			return null;
		}
		return await createOpenWaClient().getProfilePicture(session.openwaSessionId, chatId);
	} catch (error) {
		logger.warn("profile picture fetch failed", {
			ctx: "whatsapp.contactWhatsapp.avatar",
			chatId,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Best-effort fetch of the contact's name AS WHATSAPP KNOWS IT — the contact's self-set display name
 * ("pushname"), else the address-book name. Any error yields null.
 */
async function resolveWhatsappName(
	subaccountId: string,
	chatId: string,
	activeSessionId: string | null,
): Promise<string | null> {
	try {
		const sessions = await listWhatsAppSessions(subaccountId);
		if (sessions.length === 0) {
			return null;
		}
		// A contact is only known to the number it actually messaged — which, with multiple numbers, may
		// differ from the current send-from (activeSessionId). Query the active session first, then the
		// rest; the first session that knows the contact wins. (getContactById 404s on a session that
		// never saw the contact, so each lookup is guarded.) Each call is now bounded by the client's
		// read timeout, so a degraded session can't stall the loop.
		const ordered = [
			...sessions.filter((s) => s.id === activeSessionId),
			...sessions.filter((s) => s.id !== activeSessionId),
		];
		const client = createOpenWaClient();
		for (const s of ordered) {
			try {
				const contact = await client.getContactById(s.openwaSessionId, chatId);
				const name = contact?.pushName?.trim() || contact?.name?.trim();
				if (name) {
					return name;
				}
			} catch {
				// Not found / unreachable on this session — try the next.
			}
		}
		return null;
	} catch (error) {
		logger.warn("WhatsApp name fetch failed", {
			ctx: "whatsapp.contactWhatsapp.waName",
			chatId,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * The WhatsApp-side enrichments for the contact panel — avatar + WhatsApp display name. Split out of
 * getContactProfile so those OpenWA round-trips (which can be slow when a session is degraded) load
 * asynchronously and never block the panel's core CRM data from rendering.
 */
export const getContactWhatsapp = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-whatsapp",
		tags: ["WhatsApp"],
		summary: "Fetch a contact's WhatsApp avatar + display name",
		description:
			"Best-effort WhatsApp enrichments (profile picture, self-set name) for a chat. Loaded separately from the CRM contact profile so a slow session never blocks the panel.",
	})
	.input(z.object({ chatId: z.string(), subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<ContactWhatsappInfo> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const conversation = await getConversation(subaccount.id, input.chatId);
		const activeSessionId = conversation?.activeSessionId ?? null;

		const [avatarUrl, whatsappName] = await Promise.all([
			resolveAvatarUrl(subaccount.id, input.chatId, activeSessionId),
			resolveWhatsappName(subaccount.id, input.chatId, activeSessionId),
		]);

		return { avatarUrl, whatsappName };
	});
