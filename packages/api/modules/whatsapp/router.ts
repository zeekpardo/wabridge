import { adminListSessions } from "./procedures/admin-list-sessions";
import { connectGoHighLevel } from "./procedures/connect-gohighlevel";
import { connectNumber } from "./procedures/connect-number";
import { deleteMessage } from "./procedures/delete-message";
import { deleteMessageTemplate } from "./procedures/delete-message-template";
import { deleteSession } from "./procedures/delete-session";
import { disconnectGoHighLevel } from "./procedures/disconnect-gohighlevel";
import { forwardMessage } from "./procedures/forward-message";
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
import { createGroup } from "./procedures/group-create";
import { setGroupDescription } from "./procedures/group-description";
import { getGroup } from "./procedures/group-get";
import { getGroupInviteCode, revokeGroupInviteCode } from "./procedures/group-invite";
import { leaveGroup } from "./procedures/group-leave";
import { listGroups } from "./procedures/group-list";
import {
	addGroupParticipants,
	demoteGroupParticipants,
	promoteGroupParticipants,
	removeGroupParticipants,
} from "./procedures/group-participants";
import { setGroupSubject } from "./procedures/group-subject";
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
import { markChatRead } from "./procedures/mark-chat-read";
import { markChatUnread } from "./procedures/mark-chat-unread";
import { previewCommand } from "./procedures/preview-command";
import { reactMessage } from "./procedures/react-message";
import { reconcileConnections } from "./procedures/reconcile-connections";
import { reconcileSessions } from "./procedures/reconcile-sessions";
import { replyMessage } from "./procedures/reply-message";
import { requestPairingCode } from "./procedures/request-pairing-code";
import { saveMessageTemplate } from "./procedures/save-message-template";
import { sendContact } from "./procedures/send-contact";
import { sendLocation } from "./procedures/send-location";
import { sendMessage } from "./procedures/send-message";
import { sendTestMessage } from "./procedures/send-test-message";
import { setContactFields } from "./procedures/set-contact-fields";
import { setContactOwner } from "./procedures/set-contact-owner";
import { setContactTags } from "./procedures/set-contact-tags";
import { setConversationNumber } from "./procedures/set-conversation-number";
import { setOwnerNumber } from "./procedures/set-owner-number";
import { setTyping } from "./procedures/set-typing";
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
	// Message actions (reply / react / forward / delete / send location + contact)
	replyMessage,
	reactMessage,
	forwardMessage,
	deleteMessage,
	sendLocation,
	sendContact,
	// Chat state
	markChatRead,
	markChatUnread,
	setTyping,
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
	// Groups (tied to the member number; all POST under /whatsapp/groups...)
	listGroups,
	getGroup,
	createGroup,
	addGroupParticipants,
	removeGroupParticipants,
	promoteGroupParticipants,
	demoteGroupParticipants,
	setGroupSubject,
	setGroupDescription,
	getGroupInviteCode,
	revokeGroupInviteCode,
	leaveGroup,
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
