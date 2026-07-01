import { connectNumber } from "./procedures/connect-number";
import { deleteSession } from "./procedures/delete-session";
import { getQr } from "./procedures/get-qr";
import { getSession } from "./procedures/get-session";
import { listMessages } from "./procedures/list-messages";
import { listSessions } from "./procedures/list-sessions";
import { requestPairingCode } from "./procedures/request-pairing-code";
import { sendTestMessage } from "./procedures/send-test-message";

export const whatsappRouter = {
	listSessions,
	connectNumber,
	getSession,
	getQr,
	requestPairingCode,
	deleteSession,
	sendTestMessage,
	listMessages,
};
