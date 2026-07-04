import { ORPCError } from "@orpc/server";
import { getWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";
import { type OpenWaClient, toChatId } from "@repo/whatsapp";

type WhatsAppSession = NonNullable<Awaited<ReturnType<typeof getWhatsAppSession>>>;

/**
 * Normalize the participants selected for a group op to real phone `@c.us` jids.
 *
 * A contact can be addressed by a `@lid` privacy id whose digits are NOT a phone —
 * dialing them (`<lid>@c.us`) is what made WhatsApp reject the add with a bogus number
 * like `+50260109992087`. Resolve each `@lid` to the contact's actual phone via the
 * gateway; a plain phone / `@c.us` passes through. Unresolvable lids are dropped (they
 * can't be added by number), and the list is de-duped so a contact picked by both its
 * phone and its lid collapses to one entry.
 */
export async function resolveParticipantJids(
	openwa: OpenWaClient,
	openwaSessionId: string,
	values: string[],
): Promise<string[]> {
	const resolved = await Promise.all(
		values.map(async (value) => {
			if (value.endsWith("@lid")) {
				try {
					const phone = await openwa.resolveContactPhone(openwaSessionId, value);
					return phone ? toChatId(phone) : null;
				} catch (error) {
					logger.warn(error, { ctx: "whatsapp.resolveParticipantJids", value });
					return null;
				}
			}
			return value.endsWith("@c.us") ? value : toChatId(value);
		}),
	);
	return [...new Set(resolved.filter((value): value is string => value !== null))];
}

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
