import { ORPCError } from "@orpc/server";
import {
	getConversation,
	getDefaultSession,
	getGhlConnection,
	getOwnerDefaultNumber,
	getSessionByPriority,
	getWhatsAppSession,
	getWhatsAppSettings,
	setConversationActiveSession,
	touchConversationOutbound,
} from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { type GlobalSpintax, processMessage, sendProcessedMessage, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { syncPrimaryNumberTag } from "../../ghl/sync-primary-number-tag";
import { mirrorAppSendToCrm } from "../../messaging/mirror";
import { resolveSubaccount } from "../lib/active-organization";
import { listAssignableOwners } from "../lib/assignable-owners";

const attachmentSchema = z.object({
	url: z.string().url().optional(),
	base64: z.string().optional(),
	mimetype: z.string().optional(),
	filename: z.string().optional(),
});

export const sendMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/send",
		tags: ["WhatsApp"],
		summary: "Send a message (commands + number routing)",
		description:
			"Process commands (spintax, delay, media, #switch) and send from the resolved number: explicit fromSessionId, else #switch priority, else the conversation's active number, else the default.",
	})
	.input(
		z
			.object({
				chatId: z.string().optional(),
				toPhone: z.string().optional(),
				text: z.string().default(""),
				attachments: z.array(attachmentSchema).optional(),
				fromSessionId: z.string().optional(),
				subaccountId: z.string().optional(),
			})
			.refine((value) => Boolean(value.chatId || value.toPhone), {
				message: "Either chatId or toPhone is required.",
			}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const chatId = input.chatId ?? toChatId(input.toPhone ?? "");

		const settings = await getWhatsAppSettings(subaccount.id);
		const globals = (settings?.globalSpintax as GlobalSpintax | null) ?? {};

		const processed = processMessage({
			text: input.text,
			attachments: input.attachments,
			globals,
		});

		// Resolve which number sends.
		let sender: Awaited<ReturnType<typeof getWhatsAppSession>> | null = null;

		// Group routing is authoritative: a group is tied to the ONE of our numbers
		// that is a member of it, pinned as the conversation's active number by the
		// inbound group message. We must send from that number — never the
		// owner/org default (a non-member number can't post to the group). This
		// overrides #switch and explicit fromSessionId, which have no meaning here.
		if (chatId.endsWith("@g.us")) {
			const conversation = await getConversation(subaccount.id, chatId);
			if (conversation?.activeSessionId) {
				sender = await getWhatsAppSession(subaccount.id, conversation.activeSessionId);
			}
			if (!sender) {
				throw new ORPCError("NOT_FOUND", {
					message: "No number is a member of this group.",
				});
			}
		} else if (processed.numberOverride) {
			sender = await getSessionByPriority(subaccount.id, processed.numberOverride.priority);
			if (!sender) {
				throw new ORPCError("NOT_FOUND", {
					message: `No number with priority ${processed.numberOverride.priority}.`,
				});
			}
			if (processed.numberOverride.scope === "session") {
				await setConversationActiveSession({
					subaccountId: subaccount.id,
					organizationId: subaccount.organizationId,
					chatId,
					sessionId: sender.id,
				});

				// Mark this number as the contact's primary via a `wa:` tag on the
				// linked GHL contact (mirrors the manual setConversationNumber path).
				// Best-effort — a GHL hiccup never fails the send.
				const ghl = await getGhlConnection(subaccount.id);
				if (ghl && sender.phone) {
					const conversation = await getConversation(subaccount.id, chatId);
					if (conversation?.ghlContactId) {
						const client = await createGoHighLevelClient(subaccount.id);
						if (client) {
							await syncPrimaryNumberTag(client, conversation.ghlContactId, sender.phone);
						}
					}
				}
			}
		} else if (input.fromSessionId) {
			sender = await getWhatsAppSession(subaccount.id, input.fromSessionId);
		} else {
			const conversation = await getConversation(subaccount.id, chatId);
			if (conversation?.activeSessionId) {
				sender = await getWhatsAppSession(subaccount.id, conversation.activeSessionId);
			}
			// No number is pinned to this thread yet: fall back to the sending
			// owner's per-subaccount default number (Phase 2 stickiness), then the
			// org default. The activeSessionId set-once above locks this choice.
			// `ownerId` is the same id space as listContactOwners: the GHL user id
			// for an embedded SSO rep (`ghl:<id>`), else the app user id. (An
			// app-login rep on a GHL-connected subaccount won't match a GHL-user
			// owner id and simply falls through to the org default.)
			if (!sender) {
				const ownerId = user.id.startsWith("ghl:") ? user.id.slice(4) : user.id;
				if (ownerId && ownerId !== "sso") {
					const ownerDefault = await getOwnerDefaultNumber(subaccount.id, ownerId);
					if (ownerDefault) {
						sender = await getWhatsAppSession(subaccount.id, ownerDefault.sessionId);
					}
				}
			}
			if (!sender) {
				sender = await getDefaultSession(subaccount.id);
			}
		}

		if (!sender) {
			throw new ORPCError("NOT_FOUND", { message: "No sendable number available." });
		}

		// A bare #switch changes the active number but sends nothing.
		if (processed.actions.length === 0) {
			return { sent: 0, processed, fromSessionId: sender.id };
		}

		// Stamp the acting staff user onto each outbound row so the thread shows
		// who sent it. The owner id is the same id space as listContactOwners /
		// owner-number defaults: the GHL user id for an embedded SSO rep
		// (`ghl:<id>`), else the app user id.
		const senderOwnerId = user.id.startsWith("ghl:") ? user.id.slice(4) : user.id;
		// Prefer the session's own name (app profile, or GHL SSO name on the
		// embedded token). When it's absent — e.g. an embedded token minted before
		// we captured the SSO name — resolve it from the SAME owners list the aside
		// and settings use, so the message sender is always one of those people.
		let sentByName = typeof user.name === "string" && user.name.trim() ? user.name.trim() : null;
		if (!sentByName && senderOwnerId && senderOwnerId !== "sso") {
			const owners = await listAssignableOwners(subaccount).catch(() => []);
			sentByName = owners.find((owner) => owner.id === senderOwnerId)?.name ?? null;
		}

		const result = await sendProcessedMessage(
			{
				openwaSessionId: sender.openwaSessionId,
				sessionRowId: sender.id,
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				chatId,
				sentByUserId: senderOwnerId,
				sentByName,
			},
			processed,
		);

		const firstText = processed.actions.find((action) => action.text)?.text;
		const preview = firstText ?? `[${processed.actions[0]?.kind ?? "message"}]`;
		await touchConversationOutbound({
			subaccountId: subaccount.id,
			organizationId: subaccount.organizationId,
			chatId,
			sessionId: sender.id,
			preview,
		});

		// Mirror the sent messages into the connected CRM's conversation timeline
		// (no-op when disconnected; never fails the send).
		await mirrorAppSendToCrm(
			{
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				sessionId: sender.id,
				chatId,
			},
			result.messages,
		);

		return { ...result, processed, fromSessionId: sender.id };
	});
