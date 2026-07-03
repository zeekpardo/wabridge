import { ORPCError, os } from "@orpc/server";
import { auth } from "@repo/auth";

import { resolveEmbeddedSession } from "./lib/embedded-session";

export const publicProcedure = os.$context<{
	headers: Headers;
}>();

export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
	const session = await auth.api.getSession({
		headers: context.headers,
	});

	if (session) {
		return await next({
			context: {
				session: session.session,
				user: session.user,
			},
		});
	}

	// Fallback for the GoHighLevel embedded Custom Page: third-party iframe
	// cookies are often blocked, so accept a verified embedded token that pins
	// the request to an agency + subaccount (minted after GHL SSO decrypt).
	const embedded = await resolveEmbeddedSession(context.headers);
	if (embedded) {
		return await next({
			context: {
				session: {
					activeOrganizationId: embedded.organizationId,
					isEmbedded: true,
					embeddedSubaccountId: embedded.subaccountId,
				} as unknown as NonNullable<typeof session>["session"],
				user: {
					id: `ghl:${embedded.ghlUserId ?? "sso"}`,
					name: embedded.ghlUserName ?? undefined,
				} as unknown as NonNullable<typeof session>["user"],
			},
		});
	}

	throw new ORPCError("UNAUTHORIZED");
});

export const adminProcedure = protectedProcedure.use(async ({ context, next }) => {
	if (context.user.role !== "admin") {
		throw new ORPCError("FORBIDDEN");
	}

	return await next();
});
