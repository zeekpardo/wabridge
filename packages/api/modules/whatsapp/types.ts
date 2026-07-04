import { z } from "zod";

/** A saved bulk-message template (spintax/delay command text + a friendly name). */
export const messageTemplateSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(120),
	text: z.string().max(5000),
	updatedAt: z.string(),
});

export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

/** Parse the stored JSON array defensively — bad/legacy rows collapse to []. */
export function parseMessageTemplates(value: unknown): MessageTemplate[] {
	return z
		.array(messageTemplateSchema)
		.catch([])
		.parse(value ?? []);
}

/** Cap so a runaway save loop can't bloat the settings row. */
export const MAX_MESSAGE_TEMPLATES = 100;

/**
 * A staff trigger: when an outbound message contains `phrase` (case-sensitive,
 * "contains" match), the CRM contact gets `tag` added.
 */
export const staffTriggerSchema = z.object({
	phrase: z.string().min(1).max(200),
	tag: z.string().min(1).max(120),
});

export type StaffTrigger = z.infer<typeof staffTriggerSchema>;

/** Parse the stored JSON array defensively — bad/legacy rows collapse to []. */
export function parseStaffTriggers(value: unknown): StaffTrigger[] {
	return z
		.array(staffTriggerSchema)
		.catch([])
		.parse(value ?? []);
}

/** Cap so a runaway save can't bloat the settings row. */
export const MAX_STAFF_TRIGGERS = 100;
