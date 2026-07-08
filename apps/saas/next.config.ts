// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
	// Emit a self-contained server bundle (apps/saas/.next/standalone/...) so the
	// Docker runtime image ships only what it needs. Required by the Railway deploy.
	output: "standalone",
	transpilePackages: ["@repo/api", "@repo/auth", "@repo/database", "@repo/ui"],
	// Let dev asset requests (fonts, HMR) through when the app is reached via a
	// tunnel host instead of localhost (GHL local testing). Dev-only; ignored in prod.
	allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app"],
	images: {
		remotePatterns: [
			{
				// google profile images
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				// github profile images
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
		],
	},
	// NOTE: the /embedded/* `frame-ancestors` CSP is set at RUNTIME in middleware.ts (see that file),
	// not here. next.config `headers()` is baked at build time, which cannot express the open-ended
	// set of white-label agency domains that embed the GHL Custom Page.
	async redirects() {
		return [
			{
				source: "/settings",
				destination: "/settings/general",
				permanent: true,
			},
			{
				source: "/:organizationSlug/settings",
				destination: "/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: "/admin",
				destination: "/admin/users",
				permanent: true,
			},
		];
	},
	webpack: (config, { webpack, isServer }) => {
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
			}),
		);

		if (isServer) {
			config.plugins.push(new PrismaPlugin());
		}

		return config;
	},
};

export default withNextIntl(nextConfig);
