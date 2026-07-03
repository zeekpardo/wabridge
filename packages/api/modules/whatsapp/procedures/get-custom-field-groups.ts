import { resolveCrmProvider } from "@repo/crm";
import { getConversation, getGhlConnection } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSubaccount } from "../lib/active-organization";

export interface CustomFieldValue {
	id: string;
	name: string;
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
				const provider = await resolveCrmProvider(subaccount.id);
				if (!provider) {
					return { folders: [] };
				}

				const groups = await provider.customFieldGroups(conversation.ghlContactId);
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
