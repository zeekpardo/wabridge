import { ORPCError } from "@orpc/server";
import {
	assignConversationSessionById,
	countConversationsBySession,
	listSendableSessions,
	listUnassignedPhoneConversations,
} from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export const backfillNumberAssignments = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/backfill-assignments",
		tags: ["WhatsApp"],
		summary: "Evenly assign numbers to unassigned contacts",
		description:
			"One-time backfill: assign a sticky sending number to every 1:1 phone contact that has none yet, " +
			"spread across the subaccount's ready numbers so they end up evenly loaded. Contacts that already " +
			"have a number are never moved (they keep their established thread).",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const [unassigned, sessions, counts] = await Promise.all([
			listUnassignedPhoneConversations(subaccount.id),
			listSendableSessions(subaccount.id),
			countConversationsBySession(subaccount.id),
		]);

		if (sessions.length === 0) {
			throw new ORPCError("NOT_FOUND", { message: "No ready number available to assign." });
		}
		if (unassigned.length === 0) {
			return { assigned: 0 };
		}

		// Track live load per number (existing tally + what we assign in this batch) so the backfill
		// stays even across the pool, not just even among the new contacts.
		const load = new Map<string, number>();
		for (const s of sessions) {
			load.set(s.id, counts.get(s.id) ?? 0);
		}

		let assigned = 0;
		for (const conversation of unassigned) {
			// Least-loaded number wins; ties break toward the higher-priority number (sessions are
			// pre-ordered priority-then-age, and we keep the first seen on an equal count).
			let best = sessions[0];
			let bestCount = load.get(best.id) ?? 0;
			for (const candidate of sessions) {
				const count = load.get(candidate.id) ?? 0;
				if (count < bestCount) {
					best = candidate;
					bestCount = count;
				}
			}
			await assignConversationSessionById(conversation.id, best.id);
			load.set(best.id, bestCount + 1);
			assigned++;
		}

		return { assigned };
	});
