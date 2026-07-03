import { GoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";

/**
 * Mark the contact's primary WhatsApp number on its GHL contact via a
 * `wa:<digits>` tag. There is exactly one such tag per contact — the digits of
 * the sticky primary number — so any stale `wa:` tag is stripped before the new
 * one is added (a number change replaces, not accumulates).
 *
 * Read-modify-write over the contact's tag list, idempotent: when the tag set
 * already matches, nothing is written. Best-effort — a missing contact, a GHL
 * hiccup, or a bad phone logs and returns; it must never break the caller.
 */
export async function syncPrimaryNumberTag(
	client: GoHighLevelClient,
	ghlContactId: string,
	phone: string,
): Promise<void> {
	try {
		const digits = phone.replace(/\D/g, "");
		if (!digits) {
			return;
		}
		const tag = `wa:${digits}`;

		const contact = await client.getContact(ghlContactId);
		const existing = Array.isArray(contact.tags)
			? contact.tags.filter((value): value is string => typeof value === "string")
			: [];

		const kept = existing.filter((value) => !/^wa:/i.test(value));
		const next = [...kept, tag];

		// Already correct (single wa: tag, matching digits) — no write.
		const strippedAnything = kept.length !== existing.length;
		const alreadyHadTag = existing.some((value) => value === tag);
		if (!strippedAnything && alreadyHadTag) {
			return;
		}

		await client.updateContact(ghlContactId, { tags: next });
	} catch (error) {
		logger.warn("GHL primary number tag sync failed", {
			ctx: "ghl.syncPrimaryNumberTag",
			ghlContactId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
