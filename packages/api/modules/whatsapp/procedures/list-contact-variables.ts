import { getGhlConnection } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface ContactVariable {
	/** Human-readable field name shown in the picker. */
	label: string;
	/** The GoHighLevel merge token, e.g. `{{contact.first_name}}`. */
	token: string;
	/** Picker grouping. */
	group: "Standard" | "Custom fields";
}

// GHL fills these per-contact before the message reaches our Delivery URL, so
// they never touch our spintax/delay parser — we only offer them for insertion.
const STANDARD_FIELDS: ContactVariable[] = [
	{ label: "Full name", token: "{{contact.name}}", group: "Standard" },
	{ label: "First name", token: "{{contact.first_name}}", group: "Standard" },
	{ label: "Last name", token: "{{contact.last_name}}", group: "Standard" },
	{ label: "Email", token: "{{contact.email}}", group: "Standard" },
	{ label: "Phone", token: "{{contact.phone}}", group: "Standard" },
	{ label: "Company", token: "{{contact.company_name}}", group: "Standard" },
	{ label: "City", token: "{{contact.city}}", group: "Standard" },
	{ label: "State", token: "{{contact.state}}", group: "Standard" },
	{ label: "Country", token: "{{contact.country}}", group: "Standard" },
	{ label: "Postal code", token: "{{contact.postal_code}}", group: "Standard" },
];

/**
 * GoHighLevel contact merge variables for the builder: the standard contact
 * fields plus the location's contact custom fields (by `fieldKey`). Custom
 * fields require a GHL-linked subaccount; without one, only the standard set is
 * returned. Best-effort — a GHL hiccup falls back to the standard set.
 */
export const listContactVariables = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/contact-variables",
		tags: ["WhatsApp"],
		summary: "GoHighLevel contact merge variables (standard + custom fields)",
	})
	.input(z.object({ subaccountId: z.string().optional() }))
	.handler(async ({ input, context: { user, session } }): Promise<{ variables: ContactVariable[] }> => {
		const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);
		const variables: ContactVariable[] = [...STANDARD_FIELDS];

		const ghl = await getGhlConnection(subaccount.id);
		if (!ghl) {
			return { variables };
		}

		try {
			const client = await createGoHighLevelClient(subaccount.id);
			if (!client) {
				return { variables };
			}
			const definitions = await client.getCustomFields();
			for (const def of definitions) {
				if (def.documentType && def.documentType !== "field") {
					continue;
				}
				if (def.model && def.model !== "contact") {
					continue;
				}
				variables.push({
					label: def.name,
					token: `{{${def.fieldKey}}}`,
					group: "Custom fields",
				});
			}
		} catch (error) {
			logger.warn("GHL contact variables fetch failed", {
				ctx: "whatsapp.contactVariables",
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return { variables };
	});
