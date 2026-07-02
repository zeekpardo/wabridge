export { decrypt, decryptGhlSsoPayload, encrypt } from "./lib/crypto";

export { TokenManager } from "./lib/token-refresh/token-manager";
export { TokenExpiredError } from "./lib/token-refresh/types";
export type {
	OAuthTokens,
	RefreshFunction,
	TokenCallbacks,
	TokenManagerConfig,
} from "./lib/token-refresh/types";
export { createGhlRefreshFn } from "./lib/token-refresh/adapters";

export { GoHighLevelClient } from "./lib/gohighlevel/client";
export { ghlContactDisplayName } from "./lib/gohighlevel/types";
export type { GoHighLevelClientOptions } from "./lib/gohighlevel/client";
export { exchangeGhlCode, getGhlAuthUrl, refreshGhlToken } from "./lib/gohighlevel/oauth";
export { verifyGhlWebhookSignature } from "./lib/gohighlevel/webhook-verify";
export type {
	GHLApiResponse,
	GHLContact,
	GHLContactCreateInput,
	GHLContactUpdateInput,
	GHLConversation,
	GHLCustomFieldDefinition,
	GHLCustomFieldValue,
	GHLInboundMessageInput,
	GHLLocation,
	GHLMessageDirection,
	GHLMessageResponse,
	GHLMessageStatus,
	GHLMessageType,
	GHLOutboundMessageInput,
	GHLTokenResponse,
	GHLUpdateMessageStatusInput,
	GHLUser,
} from "./lib/gohighlevel/types";

export { createGoHighLevelClient } from "./lib/client-factories";
