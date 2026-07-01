import { adminListSessions } from "./procedures/admin-list-sessions";
import { connectNumber } from "./procedures/connect-number";
import { deleteSession } from "./procedures/delete-session";
import { getChatHistory } from "./procedures/get-chat-history";
import { getContactProfile } from "./procedures/get-contact-profile";
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
	// Inbox / conversations
	listConversations: listConversationsProcedure,
	listChats,
	getThread,
	getChatHistory,
	linkPreview,
	setConversationNumber,
	listNumbers,
	// Contact / CRM panel (prewired for GoHighLevel)
	getContactProfile,
	listContactOwners,
	setContactOwner,
	setContactTags,
};
