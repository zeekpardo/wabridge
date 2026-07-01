import { auth } from "@repo/auth";
import { logger } from "@repo/logs";
import { webhookHandler as paymentsWebhookHandler } from "@repo/payments";
import { getBaseUrl } from "@repo/utils";
import { webhookHandler as openwaWebhookHandler } from "@repo/whatsapp";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";

import {
	ghlAuthorizeHandler,
	ghlCallbackHandler,
	ghlProviderOutboundHandler,
	ghlSsoDecryptHandler,
} from "./modules/ghl/handlers";
import { openApiHandler, rpcHandler } from "./orpc/handler";

export { router } from "./orpc/router";

export const app = new Hono()
	.basePath("/api")
	// Logger middleware
	.use(honoLogger((message, ...rest) => logger.log(message, ...rest)))
	// Cors middleware
	.use(
		cors({
			origin: getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
			allowHeaders: ["Content-Type", "Authorization"],
			allowMethods: ["POST", "GET", "OPTIONS"],
			exposeHeaders: ["Content-Length"],
			maxAge: 600,
			credentials: true,
		}),
	)
	// Auth handler
	.on(["POST", "GET"], "/auth/**", (c) => auth.handler(c.req.raw))
	// Payments webhook handler
	.post("/webhooks/payments", (c) => paymentsWebhookHandler(c.req.raw))
	// OpenWA (WhatsApp) webhook handler
	.post("/webhooks/openwa", (c) => openwaWebhookHandler(c.req.raw))
	// GoHighLevel OAuth install + SSO (embedded Custom Page)
	.get("/ghl/oauth/authorize", (c) => ghlAuthorizeHandler(c.req.raw))
	.get("/ghl/oauth/callback", (c) => ghlCallbackHandler(c.req.raw))
	.post("/ghl-sso/decrypt", (c) => ghlSsoDecryptHandler(c.req.raw))
	// Conversation-provider Delivery URL (SMS takeover — GHL → WhatsApp)
	.post("/providers/sms/outbound", (c) => ghlProviderOutboundHandler(c.req.raw))
	// Health check
	.get("/health", (c) => c.text("OK"))
	// oRPC handlers (for RPC and OpenAPI)
	.use("*", async (c, next) => {
		const context = {
			headers: c.req.raw.headers,
		};

		const isRpc = c.req.path.includes("/rpc/");

		const handler = isRpc ? rpcHandler : openApiHandler;

		const prefix = isRpc ? "/api/rpc" : "/api";

		const { matched, response } = await handler.handle(c.req.raw, {
			prefix,
			context,
		});

		if (matched) {
			return c.newResponse(response.body, response);
		}

		await next();
	});
