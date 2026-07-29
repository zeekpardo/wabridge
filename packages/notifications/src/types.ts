export const NOTIFICATION_TYPES = {
	WELCOME: "WELCOME",
	APP_UPDATE: "APP_UPDATE",
	WHATSAPP_SESSION_DISCONNECTED: "WHATSAPP_SESSION_DISCONNECTED",
} as const;

export type { NotificationTarget, NotificationType } from "@repo/database";
