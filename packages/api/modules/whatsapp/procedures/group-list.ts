import { listSendableSessions } from "@repo/database";
import { type Group, createOpenWaClient } from "@repo/whatsapp";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

interface GroupListItem extends Group {
	/** The subaccount session (WhatsApp number) that is a member of the group. */
	sessionId: string;
	/** Human label for that number (its label, else phone). */
	numberLabel: string | null;
}

export const listGroups = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/groups/list",
		tags: ["WhatsApp"],
		summary: "List WhatsApp groups",
		description:
			"Aggregates groups across the subaccount's connected number(s). Each group carries the session (number) it belongs to, a number label, and isAdmin. De-duped by group id (a group lives on a single number).",
	})
	.input(
		z.object({
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const sessions = await listSendableSessions(subaccount.id);
		if (sessions.length === 0) {
			return [] as GroupListItem[];
		}

		const openwa = createOpenWaClient();
		const groupArrays = await Promise.all(
			sessions.map((row) => openwa.getGroups(row.openwaSessionId).catch(() => [] as Group[])),
		);

		// De-dupe by group id: a group is tied to a single number, but two of the
		// subaccount's numbers could theoretically both be members — keep the first.
		const byId = new Map<string, GroupListItem>();
		sessions.forEach((row, index) => {
			const numberLabel = row.label ?? row.phone ?? null;
			for (const group of groupArrays[index]) {
				if (byId.has(group.id)) {
					continue;
				}
				byId.set(group.id, {
					...group,
					sessionId: row.id,
					numberLabel,
				});
			}
		});

		return [...byId.values()];
	});
