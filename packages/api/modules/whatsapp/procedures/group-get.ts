import { resolveCrmProvider } from "@repo/crm";
import { getConversationsByChatIds } from "@repo/database";
import { logger } from "@repo/logs";
import { createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";
import { mapGroupError, resolveGroupSession } from "./group-lib";

export const getGroup = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/get",
		tags: ["WhatsApp"],
		summary: "Get a WhatsApp group's info",
		description:
			"Full group info (subject, description, participants, flags) for the given number. Each participant is overlaid with their CRM name and profile link when known.",
	})
	.input(
		z.object({
			sessionId: z.string(),
			groupId: z.string(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const sender = await resolveGroupSession(subaccount.id, input.sessionId);

		const openwa = createOpenWaClient();
		try {
			const info = await openwa.getGroupInfo(sender.openwaSessionId, input.groupId);
			// Overlay each member with their CRM name + profile link. Best-effort: any failure here
			// (no CRM connected, a GHL hiccup) just leaves the member with its WhatsApp name/number.
			const participants = await enrichParticipantsWithCrm(subaccount.id, info.participants);
			return { ...info, participants };
		} catch (error) {
			mapGroupError(error, "whatsapp.getGroup");
		}
	});

type Participant = Awaited<
	ReturnType<ReturnType<typeof createOpenWaClient>["getGroupInfo"]>
>["participants"][number];

async function enrichParticipantsWithCrm(subaccountId: string, participants: Participant[]) {
	try {
		// A member's phone -> its `<phone>@c.us` conversation carries the CRM link + name.
		const chatIds = participants
			.map((p) => p.number?.replace(/\D/g, ""))
			.filter((digits): digits is string => Boolean(digits))
			.map((digits) => `${digits}@c.us`);

		const [conversations, provider] = await Promise.all([
			getConversationsByChatIds(subaccountId, [...new Set(chatIds)]),
			resolveCrmProvider(subaccountId).catch(() => null),
		]);

		const byPhone = new Map<string, { name: string | null; ghlContactId: string | null }>();
		for (const convo of conversations) {
			const digits = convo.chatId.split("@")[0].replace(/\D/g, "");
			if (digits) {
				byPhone.set(digits, { name: convo.contactName, ghlContactId: convo.ghlContactId });
			}
		}

		return participants.map((p) => {
			const match = p.number ? byPhone.get(p.number.replace(/\D/g, "")) : undefined;
			return {
				...p,
				crmName: match?.name ?? null,
				profileUrl:
					match?.ghlContactId && provider ? provider.contactUrl(match.ghlContactId) : null,
			};
		});
	} catch (error) {
		logger.warn(error, { ctx: "whatsapp.getGroup.enrichCrm" });
		return participants.map((p) => ({ ...p, crmName: null, profileUrl: null }));
	}
}
