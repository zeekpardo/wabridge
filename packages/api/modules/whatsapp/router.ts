import { adminListSessions } from "./procedures/admin-list-sessions";
import { connectGoHighLevel } from "./procedures/connect-gohighlevel";
import { connectNumber } from "./procedures/connect-number";
import { deleteMessageTemplate } from "./procedures/delete-message-template";
import { deleteSession } from "./procedures/delete-session";
import { disconnectGoHighLevel } from "./procedures/disconnect-gohighlevel";
import { getChatHistory } from "./procedures/get-chat-history";
import { getContactProfile } from "./procedures/get-contact-profile";
import { getCustomFieldGroups } from "./procedures/get-custom-field-groups";
import { getGhlOAuthUrl } from "./procedures/get-ghl-oauth-url";
import { getGhlProvisionUrl } from "./procedures/get-ghl-provision-url";
import { getQr } from "./procedures/get-qr";
import { getSampleContact } from "./procedures/get-sample-contact";
import { getSession } from "./procedures/get-session";
import { getSettings } from "./procedures/get-settings";
import { getThread } from "./procedures/get-thread";
import { linkContactByPhone } from "./procedures/link-contact-by-phone";
import { linkPreview } from "./procedures/link-preview";
import { listChats } from "./procedures/list-chats";
import { listContactOwners } from "./procedures/list-contact-owners";
import { listContactTags } from "./procedures/list-contact-tags";
import { listContactVariables } from "./procedures/list-contact-variables";
import { listConversationsProcedure } from "./procedures/list-conversations";
import { listMessages } from "./procedures/list-messages";
import { listNumbers } from "./procedures/list-numbers";
import { listOwnerNumbers } from "./procedures/list-owner-numbers";
import { listSessions } from "./procedures/list-sessions";
import { previewCommand } from "./procedures/preview-command";
import { reconcileConnections } from "./procedures/reconcile-connections";
import { reconcileSessions } from "./procedures/reconcile-sessions";
import { requestPairingCode } from "./procedures/request-pairing-code";
import { saveMessageTemplate } from "./procedures/save-message-template";
import { sendMessage } from "./procedures/send-message";
import { sendTestMessage } from "./procedures/send-test-message";
import { setContactFields } from "./procedures/set-contact-fields";
import { setContactOwner } from "./procedures/set-contact-owner";
import { setContactTags } from "./procedures/set-contact-tags";
import { setConversationNumber } from "./procedures/set-conversation-number";
import { setOwnerNumber } from "./procedures/set-owner-number";
import { updateNumber } from "./procedures/update-number";
import { updateSettings } from "./procedures/update-settings";

export const whatsappRouter = {
	listSessions,
	connectNumber,
	getSession,
	getQr,
	requestPairingCode,
	deleteSession,
	updateNumber,
	sendTestMessage,
	sendMessage,
	previewCommand,
	listMessages,
	getSettings,
	updateSettings,
	saveMessageTemplate,
	deleteMessageTemplate,
	adminListSessions,
	reconcileSessions,
	reconcileConnections,
	// Inbox / conversations
	listConversations: listConversationsProcedure,
	listChats,
	getThread,
	getChatHistory,
	linkPreview,
	linkContactByPhone,
	setConversationNumber,
	listNumbers,
	listOwnerNumbers,
	setOwnerNumber,
	// GoHighLevel install (popup OAuth → callback page → connect) + disconnect
	getGhlOAuthUrl,
	getGhlProvisionUrl,
	connectGoHighLevel,
	disconnectGoHighLevel,
	// Contact / CRM panel (prewired for GoHighLevel)
	getContactProfile,
	listContactOwners,
	setContactOwner,
	setContactTags,
	setContactFields,
	listContactTags,
	getCustomFieldGroups,
	listContactVariables,
	getSampleContact,
};
