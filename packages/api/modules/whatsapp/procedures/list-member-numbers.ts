import { listMemberDefaultNumbers, listOrganizationMembers } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface MemberNumber {
	memberId: string;
	name: string;
	/** The member's default sending number, or null when unset. */
	sessionId: string | null;
}

/**
 * Each agency member paired with their default sending number for the resolved
 * subaccount (null when the member has no default), for the settings UI.
 */
export const listMemberNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/whatsapp/member-numbers",
		tags: ["WhatsApp"],
		summary: "List members with their default numbers",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<MemberNumber[]> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const [members, defaults] = await Promise.all([
			listOrganizationMembers(subaccount.organizationId),
			listMemberDefaultNumbers(subaccount.id),
		]);

		const sessionByMember = new Map(defaults.map((row) => [row.memberId, row.sessionId]));

		return members.map((member) => ({
			memberId: member.id,
			name: member.user.name || member.user.email,
			sessionId: sessionByMember.get(member.id) ?? null,
		}));
	});
