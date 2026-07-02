import { getGhlConnection } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface SampleContact {
	/** Display label for the preview, e.g. the contact's name. */
	label: string;
	/** Merge token → value, e.g. { "{{contact.first_name}}": "Jane" }. */
	values: Record<string, string>;
}

/**
 * A random contact from the linked GoHighLevel location, flattened into a
 * merge-token → value map so the builder preview can show a message as it would
 * look for a real profile (standard fields + custom field values). Returns null
 * when the subaccount isn't GHL-linked or the location has no contacts.
 */
export const getSampleContact = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/sample-contact",
		tags: ["WhatsApp"],
		summary: "A random GoHighLevel contact for preview substitution",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(
		async ({ input, context: { user, session } }): Promise<{ contact: SampleContact | null }> => {
			const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

			const ghl = await getGhlConnection(subaccount.id);
			if (!ghl) {
				return { contact: null };
			}

			try {
				const client = await createGoHighLevelClient(subaccount.id);
				if (!client) {
					return { contact: null };
				}

				const [contacts, definitions] = await Promise.all([
					client.listContacts(25),
					client.getCustomFields(),
				]);
				if (contacts.length === 0) {
					return { contact: null };
				}

				const contact = contacts[Math.floor(Math.random() * contacts.length)] ?? contacts[0]!;
				const fieldKeyById = new Map(definitions.map((def) => [def.id, def.fieldKey]));

				const fullName =
					contact.name ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
				const values: Record<string, string> = {};
				const set = (token: string, value?: string | null) => {
					if (value != null && value !== "") {
						values[token] = String(value);
					}
				};

				set("{{contact.name}}", fullName);
				set("{{contact.first_name}}", contact.firstName);
				set("{{contact.last_name}}", contact.lastName);
				set("{{contact.email}}", contact.email);
				set("{{contact.phone}}", contact.phone);
				set("{{contact.company_name}}", contact.companyName);
				set("{{contact.city}}", contact.city);
				set("{{contact.state}}", contact.state);
				set("{{contact.country}}", contact.country);
				set("{{contact.postal_code}}", contact.postalCode);

				for (const field of contact.customFields ?? []) {
					const fieldKey = fieldKeyById.get(field.id);
					if (!fieldKey) {
						continue;
					}
					const value = Array.isArray(field.value) ? field.value.join(", ") : field.value;
					set(`{{${fieldKey}}}`, value);
				}

				return {
					contact: { label: fullName || contact.email || contact.phone || "Contact", values },
				};
			} catch (error) {
				logger.warn("GHL sample contact fetch failed", {
					ctx: "whatsapp.sampleContact",
					error: error instanceof Error ? error.message : String(error),
				});
				return { contact: null };
			}
		},
	);
