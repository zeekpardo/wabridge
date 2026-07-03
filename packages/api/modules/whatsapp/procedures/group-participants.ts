import { createOpenWaClient, toChatId } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

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
	.input(participantsInput)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			await openwa.addGroupParticipants(
				sender.openwaSessionId,
				input.groupId,
				input.participants.map(toParticipantJid),
			);
		} catch (error) {
			mapGroupError(error, "whatsapp.addGroupParticipants");
		}

		return { ok: true };
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
