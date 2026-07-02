import { getConversation, getGhlConnection } from "@repo/database";
import { createGoHighLevelClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface CustomFieldValue {
	id: string;
	name: string;
	dataType: string;
	value: string | null;
}

export interface CustomFieldFolderGroup {
	id: string;
	name: string;
	fields: CustomFieldValue[];
}

/**
 * The linked GHL contact's custom fields, grouped by folder and ordered like
 * GHL's own layout (folder position, then field position within it). Every
 * folder's full field set is returned (value null when the contact has none),
 * so the panel can render folder sections and let the user choose which to
 * show. Returns an empty list when the subaccount isn't GHL-linked.
 */
export const getCustomFieldGroups = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/custom-field-groups",
		tags: ["WhatsApp"],
		summary: "Contact custom fields grouped by folder",
	})
	.input(z.object({ chatId: z.string(), subaccountId: z.string().optional() }))
	.handler(
		async ({
			input,
			context: { user, session },
		}): Promise<{ folders: CustomFieldFolderGroup[] }> => {
			const subaccount = await resolveSubaccount(session, user.id, input.subaccountId);

			const [conversation, ghl] = await Promise.all([
				getConversation(subaccount.id, input.chatId),
				getGhlConnection(subaccount.id),
			]);
			if (!ghl || !conversation?.ghlContactId) {
				return { folders: [] };
			}

			try {
				const client = await createGoHighLevelClient(subaccount.id);
				if (!client) {
					return { folders: [] };
				}

				const [definitions, folders, contact] = await Promise.all([
					client.getCustomFields(),
					client.getCustomFieldFolders(),
					client.getContact(conversation.ghlContactId),
				]);

				// The contact's set values, keyed by field id.
				const valueById = new Map<string, string>();
				for (const field of contact.customFields ?? []) {
					const value = Array.isArray(field.value) ? field.value.join(", ") : field.value;
					if (value != null && value !== "") {
						valueById.set(field.id, String(value));
					}
				}

				// Fields keyed by their folder, ordered by position within each.
				const byFolder = new Map<string, typeof definitions>();
				for (const def of definitions) {
					if (def.documentType && def.documentType !== "field") {
						continue;
					}
					const key = def.parentId ?? "__ungrouped__";
					const list = byFolder.get(key) ?? [];
					list.push(def);
					byFolder.set(key, list);
				}

				const groups: CustomFieldFolderGroup[] = [];
				for (const folder of folders) {
					const defs = (byFolder.get(folder.id) ?? [])
						.slice()
						.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
					if (defs.length === 0) {
						continue;
					}
					groups.push({
						id: folder.id,
						name: folder.name,
						fields: defs.map((def) => ({
							id: def.id,
							name: def.name,
							dataType: def.dataType,
							value: valueById.get(def.id) ?? null,
						})),
					});
				}

				return { folders: groups };
			} catch (error) {
				logger.warn("GHL custom field groups fetch failed", {
					ctx: "whatsapp.customFieldGroups",
					error: error instanceof Error ? error.message : String(error),
				});
				return { folders: [] };
			}
		},
	);
