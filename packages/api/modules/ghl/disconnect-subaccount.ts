import {
	clearConversationGhlLinks,
	deleteGhlConnection,
	getGhlConnection,
	updateSubaccount,
} from "@repo/database";

/**
 * Tear down a subaccount's GoHighLevel link: drop the stored connection (tokens),
 * clear every conversation's cached GHL contact/conversation ids, and unlink the
 * location. Local data (numbers, conversations, messages) keeps working
 * standalone. Shared by the manual Disconnect action and the marketplace
 * UNINSTALL webhook. Returns whether a connection was actually removed.
 */
export async function disconnectSubaccountFromGhl(subaccount: {
	id: string;
	organizationId: string;
}): Promise<boolean> {
	const connection = await getGhlConnection(subaccount.id);
	if (connection) {
		await deleteGhlConnection(subaccount.id);
	}
	// Clear the link + cached ids unconditionally, so a half-disconnected account
	// (location still set but no connection) is fully cleaned up too.
	await clearConversationGhlLinks(subaccount.id);
	await updateSubaccount(subaccount.organizationId, subaccount.id, { ghlLocationId: null });
	return Boolean(connection);
}
