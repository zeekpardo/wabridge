import { ORPCError } from "@orpc/server";
import {
	bumpRecoveryAttempt,
	getDefaultSession,
	getRecoveryMessage,
	getWhatsAppSession,
	markRecoveryRecovered,
} from "@repo/database";
import { z } from "zod";

import { createFanOutDeps } from "../../messaging/deps";
import { fanOutMessage } from "../../messaging/fan-out";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

/**
 * Resend a captured failed message now that a number is back. Delivers over
 * WhatsApp AND records it as a sent outbound in GHL (fan-out origin "app"), then
 * marks the recovery row recovered. Prefers the original sending number if it has
 * reconnected, else the subaccount's default ready number. `sendDelayMs` lets the
 * caller pace a bulk "resend all" (reuses the existing capped pre-send delay).
 */
export const resendRecovery = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/recovery/resend",
		tags: ["WhatsApp"],
		summary: "Resend a failed message",
		description: "Deliver a captured failed send over WhatsApp and record it in GHL.",
	})
	.input(
		z.object({
			subaccountId: z.string().optional(),
			id: z.string(),
			sendDelayMs: z.number().int().min(0).max(15_000).optional(),
		}),
	)
	.handler(async ({ input, context: { user, session } }) => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

		const row = await getRecoveryMessage(subaccount.id, input.id);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Recovery message not found." });
		}
		// Already handled (recovered/dismissed) — treat as a no-op so a double-click
		// or a re-run of "resend all" is harmless.
		if (row.status !== "pending") {
			return { id: row.id, status: row.status, waMessageId: row.waMessageId };
		}

		// Prefer the number this thread used if it has reconnected; otherwise the
		// subaccount's default ready number. Both getters return only ready sessions.
		let sendSession = null as Awaited<ReturnType<typeof getWhatsAppSession>>;
		if (row.sessionId) {
			const original = await getWhatsAppSession(subaccount.id, row.sessionId);
			if (original?.status === "ready") {
				sendSession = original;
			}
		}
		if (!sendSession) {
			sendSession = await getDefaultSession(subaccount.id);
		}
		if (!sendSession) {
			throw new ORPCError("CONFLICT", {
				message: "No connected WhatsApp number to resend from. Reconnect a number first.",
			});
		}

		const attachments = Array.isArray(row.attachments)
			? (row.attachments as string[])
			: undefined;
		const now = new Date();

		try {
			const result = await fanOutMessage(
				{
					subaccountId: subaccount.id,
					organizationId: subaccount.organizationId,
					sessionId: sendSession.id,
					chatId: row.chatId,
					direction: "outbound",
					// "app": deliver over WhatsApp AND record a sent outbound in GHL.
					origin: "app",
					body: row.body,
					type: row.type,
					attachments,
					sendDelayMs: input.sendDelayMs,
					timestamp: now,
				},
				createFanOutDeps(),
			);

			if (!result.waMessageId && !result.deduped) {
				await bumpRecoveryAttempt(subaccount.id, row.id, "Send did not reach WhatsApp", now);
				throw new ORPCError("CONFLICT", { message: "Message still could not be delivered." });
			}

			await markRecoveryRecovered(subaccount.id, row.id, result.waMessageId ?? null, now);
			return { id: row.id, status: "recovered", waMessageId: result.waMessageId ?? null };
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			await bumpRecoveryAttempt(
				subaccount.id,
				row.id,
				error instanceof Error ? error.message : "Resend failed",
				now,
			);
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Resend failed." });
		}
	});
