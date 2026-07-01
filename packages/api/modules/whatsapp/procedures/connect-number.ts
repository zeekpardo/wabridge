import { randomBytes } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { countWhatsAppSessions, createWhatsAppSession } from "@repo/database";
import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { createOpenWaClient, OPENWA_WEBHOOK_EVENTS, type OpenWaWebhookEvent } from "@repo/whatsapp";
import { customAlphabet } from "nanoid";

// OpenWA session names allow ONLY letters, numbers, and hyphens (no underscores).
const sessionSuffix = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

const WEBHOOK_EVENTS: OpenWaWebhookEvent[] = Object.values(OPENWA_WEBHOOK_EVENTS);

export const connectNumber = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/sessions",
		tags: ["WhatsApp"],
		summary: "Connect a WhatsApp number",
		description:
			"Creates and starts an OpenWA session for the active organization, registers its webhook and persists a WhatsAppSession",
	})
	.input(
		z.object({
			label: z.string().max(100).optional(),
			subaccountId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { label, subaccountId }, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, subaccountId);

		// Next send-priority for this subaccount (1 = first/highest). Powers #switch|N.
		const priority = (await countWhatsAppSessions(subaccount.id)) + 1;

		const openwa = createOpenWaClient();

		// Globally-unique OpenWA session name. Letters/numbers/hyphens only
		// (OpenWA rejects underscores); cuid ids are lowercase-alphanumeric.
		const openwaName = `sub-${subaccount.id}-${sessionSuffix()}`;
		const webhookSecret = randomBytes(32).toString("hex");

		const baseUrl = getBaseUrl(
			process.env.WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_SAAS_URL,
			3000,
		);
		const webhookUrl = `${baseUrl}/api/webhooks/openwa`;

		try {
			const created = await openwa.createSession({ name: openwaName });

			await openwa.startSession(created.id);

			await openwa.registerWebhook(created.id, {
				url: webhookUrl,
				events: WEBHOOK_EVENTS,
				secret: webhookSecret,
			});

			return await createWhatsAppSession({
				subaccountId: subaccount.id,
				organizationId: subaccount.organizationId,
				openwaSessionId: created.id,
				openwaName,
				workerBaseUrl: process.env.OPENWA_BASE_URL as string,
				status: created.status,
				webhookSecret,
				label,
				phone: created.phone ?? null,
				jid: created.jid ?? null,
				priority,
			});
		} catch (error) {
			logger.error(error, { ctx: "whatsapp.connectNumber", subaccountId: subaccount.id });
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}
	});
