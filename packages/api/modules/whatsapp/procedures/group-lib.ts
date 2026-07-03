import { ORPCError } from "@orpc/server";
import { getWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";

type WhatsAppSession = NonNullable<Awaited<ReturnType<typeof getWhatsAppSession>>>;

/**
 * Resolve the session a group action must run against. Groups are tied to the
 * specific number (session) that is a member, so the caller always names the
 * session explicitly (unlike 1:1 sends, which fall back to a default number).
 * Throws `NOT_FOUND` when the session isn't one of the subaccount's numbers.
 */
export async function resolveGroupSession(
	subaccountId: string,
	sessionId: string,
): Promise<WhatsAppSession> {
	const session = await getWhatsAppSession(subaccountId, sessionId);
	if (!session) {
		throw new ORPCError("NOT_FOUND", { message: "Number not found." });
	}
	return session;
}

/**
 * Map a gateway error into an `ORPCError`. The OpenWA client throws a plain
 * `Error` whose message embeds the upstream HTTP status
 * (`OpenWA request failed: ... -> 404 ...`); 404 means the number isn't a
 * member of the group, everything else is treated as an upstream failure.
 */
export function mapGroupError(error: unknown, ctx: string): never {
	logger.error(error, { ctx });
	const message = error instanceof Error ? error.message : "";
	if (/-> 404\b/.test(message)) {
		throw new ORPCError("NOT_FOUND", { message: "Group not found." });
	}
	if (/-> 400\b/.test(message)) {
		throw new ORPCError("BAD_REQUEST");
	}
	throw new ORPCError("INTERNAL_SERVER_ERROR");
}
