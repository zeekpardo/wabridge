import { adminListSessions } from "./procedures/admin-list-sessions";
import { connectGoHighLevel } from "./procedures/connect-gohighlevel";
import { connectNumber } from "./procedures/connect-number";
import { deleteSession } from "./procedures/delete-session";
import { disconnectGoHighLevel } from "./procedures/disconnect-gohighlevel";
import { getChatHistory } from "./procedures/get-chat-history";
import { getContactProfile } from "./procedures/get-contact-profile";
import { getGhlOAuthUrl } from "./procedures/get-ghl-oauth-url";
import { getQr } from "./procedures/get-qr";
import { getSession } from "./procedures/get-session";
import { getSettings } from "./procedures/get-settings";
import { getThread } from "./procedures/get-thread";
import { linkPreview } from "./procedures/link-preview";
import { listChats } from "./procedures/list-chats";
import { listContactOwners } from "./procedures/list-contact-owners";
import { listConversationsProcedure } from "./procedures/list-conversations";
import { listMessages } from "./procedures/list-messages";
import { listNumbers } from "./procedures/list-numbers";
import { listSessions } from "./procedures/list-sessions";
import { previewCommand } from "./procedures/preview-command";
import { reconcileConnections } from "./procedures/reconcile-connections";
import { reconcileSessions } from "./procedures/reconcile-sessions";
import { requestPairingCode } from "./procedures/request-pairing-code";
import { sendMessage } from "./procedures/send-message";
import { sendTestMessage } from "./procedures/send-test-message";
import { setContactOwner } from "./procedures/set-contact-owner";
import { setContactTags } from "./procedures/set-contact-tags";
import { setConversationNumber } from "./procedures/set-conversation-number";
import { updateSettings } from "./procedures/update-settings";

export const whatsappRouter = {
	listSessions,
	connectNumber,
	getSession,
	getQr,
	requestPairingCode,
	deleteSession,
	sendTestMessage,
	sendMessage,
	previewCommand,
	listMessages,
	getSettings,
	updateSettings,
	adminListSessions,
	reconcileSessions,
	reconcileConnections,
	// Inbox / conversations
	listConversations: listConversationsProcedure,
	listChats,
	getThread,
	getChatHistory,
	linkPreview,
	setConversationNumber,
	listNumbers,
	// GoHighLevel install (popup OAuth → callback page → connect) + disconnect
	getGhlOAuthUrl,
	connectGoHighLevel,
	disconnectGoHighLevel,
	// Contact / CRM panel (prewired for GoHighLevel)
	getContactProfile,
	listContactOwners,
	setContactOwner,
	setContactTags,
};
