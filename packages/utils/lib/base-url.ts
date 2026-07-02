/**
 * Returns the base URL for the current app. Pass the env value directly so Next.js
 * can replace it at build time (e.g. process.env.NEXT_PUBLIC_SAAS_URL).
 *
 * @param envValue - The env value to use when defined (e.g. process.env.NEXT_PUBLIC_SAAS_URL)
 * @param defaultPort - Port for localhost fallback when no env is set (default: 3000)
 */
export function getBaseUrl(envValue?: string, defaultPort = 3000): string {
	if (envValue) {
		return envValue;
	}
	if (process.env.NEXT_PUBLIC_VERCEL_URL) {
		return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
	}
	return `http://localhost:${process.env.PORT ?? defaultPort}`;
}

/**
 * All origins the app is served from: the canonical base URL plus any extra
 * domains listed in ADDITIONAL_TRUSTED_ORIGINS (comma-separated). Lets the app
 * run on a custom domain AND the Railway-provided one simultaneously — auth
 * (better-auth trustedOrigins) and API CORS both accept every listed origin,
 * while emails/OAuth redirects keep using the canonical base URL.
 */
export function getTrustedOrigins(envValue?: string, defaultPort = 3000): string[] {
	const canonical = getBaseUrl(envValue, defaultPort);
	const extra = (process.env.ADDITIONAL_TRUSTED_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim().replace(/\/+$/, ""))
		.filter(Boolean);
	return [...new Set([canonical, ...extra])];
}
