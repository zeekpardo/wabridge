import { adminListSessions } from "./procedures/admin-list-sessions";
import { connectNumber } from "./procedures/connect-number";
import { deleteSession } from "./procedures/delete-session";
import { getQr } from "./procedures/get-qr";
import { getSession } from "./procedures/get-session";
import { getSettings } from "./procedures/get-settings";
import { listMessages } from "./procedures/list-messages";
import { listSessions } from "./procedures/list-sessions";
import { previewCommand } from "./procedures/preview-command";
import { reconcileSessions } from "./procedures/reconcile-sessions";
import { requestPairingCode } from "./procedures/request-pairing-code";
import { sendMessage } from "./procedures/send-message";
import { sendTestMessage } from "./procedures/send-test-message";
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
};
