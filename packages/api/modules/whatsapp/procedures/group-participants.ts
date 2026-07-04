import { resolveCrmProvider } from "@repo/crm";
import { logger } from "@repo/logs";
import { createOpenWaClient, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession, resolveParticipantJids } from "./group-lib";

/** Normalize a participant to a `<digits>@c.us` jid (jids pass through). */
function toParticipantJid(value: string): string {
	return value.endsWith("@c.us") ? value : toChatId(value);
}

const participantsInput = z.object({
	sessionId: z.string(),
	groupId: z.string(),
	participants: z.array(z.string().min(1)).min(1),
	subaccountId: z.string().optional(),
});

export const addGroupParticipants = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/participants/add",
		tags: ["WhatsApp"],
		summary: "Add participants to a group",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			// Existing contacts to add (chat id or phone). At least one of participants / newContacts.
			participants: z.array(z.string().min(1)).default([]),
			// Typed phone + name for people not yet in the CRM: created as a CRM contact, then added.
			newContacts: z
				.array(z.object({ phone: z.string().min(6), name: z.string().min(1) }))
				.default([]),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			// Create the typed-in people as CRM contacts (with the given name) so they exist in the CRM
			// and show up named — best-effort, so a CRM hiccup still lets the WhatsApp add proceed.
			if (input.newContacts.length > 0) {
				const provider = await resolveCrmProvider(subaccount.id).catch(() => null);
				if (provider) {
					await Promise.all(
						input.newContacts.map((c) =>
							provider
								.upsertContactByPhone({ phone: c.phone, name: c.name })
								.catch((error) =>
									logger.warn(error, { ctx: "whatsapp.addGroupParticipants.upsertContact" }),
								),
						),
					);
				}
			}

			// Resolve any `@lid` privacy id to the contact's real phone before adding (a lid's digits
			// are not a dialable number). A typed phone / `@c.us` passes through unchanged.
			const fromContacts = await resolveParticipantJids(
				openwa,
				sender.openwaSessionId,
				input.participants,
			);
			const fromNew = input.newContacts.map((c) => toChatId(c.phone));
			const participants = [...new Set([...fromContacts, ...fromNew])];
			if (participants.length === 0) {
				return { ok: true, notAdded: [] };
			}

			const results = await openwa.addGroupParticipants(
				sender.openwaSessionId,
				input.groupId,
				participants,
			);
			// Numbers WhatsApp wouldn't add directly (privacy) — the UI offers to invite them by link.
			return { ok: true, notAdded: results.filter((r) => !r.added).map((r) => r.number) };
		} catch (error) {
			mapGroupError(error, "whatsapp.addGroupParticipants");
		}
	});

export const removeGroupParticipants = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/participants/remove",
		tags: ["WhatsApp"],
		summary: "Remove participants from a group",
	})
	.input(participantsInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.removeGroupParticipants(
				sender.openwaSessionId,
				input.groupId,
				input.participants.map(toParticipantJid),
			);
		} catch (error) {
			mapGroupError(error, "whatsapp.removeGroupParticipants");
		}

		return { ok: true };
	});

export const promoteGroupParticipants = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/participants/promote",
		tags: ["WhatsApp"],
		summary: "Promote participants to group admin",
	})
	.input(participantsInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.promoteGroupParticipants(
				sender.openwaSessionId,
				input.groupId,
				input.participants.map(toParticipantJid),
			);
		} catch (error) {
			mapGroupError(error, "whatsapp.promoteGroupParticipants");
		}

		return { ok: true };
	});

export const demoteGroupParticipants = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/participants/demote",
		tags: ["WhatsApp"],
		summary: "Demote group admins to participants",
	})
	.input(participantsInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.demoteGroupParticipants(
				sender.openwaSessionId,
				input.groupId,
				input.participants.map(toParticipantJid),
			);
		} catch (error) {
			mapGroupError(error, "whatsapp.demoteGroupParticipants");
		}

		return { ok: true };
	});
