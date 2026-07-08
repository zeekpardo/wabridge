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
	async headers() {
		// Allow GoHighLevel + our white-label agency domains (+ self) to embed the /embedded/*
		// pages in an iframe. NOTE: next.config headers() is evaluated at BUILD time and the Docker
		// build does not pass GHL_FRAME_ANCESTORS, so in practice the default list below is the
		// effective value — a new white-label agency domain must be added here. (A runtime env
		// override via GHL_FRAME_ANCESTORS only applies if the build is wired to pass it at
		// `next build` time.)
		const ghlFrameAncestors =
			process.env.GHL_FRAME_ANCESTORS ??
			[
				// Standard GoHighLevel / LeadConnector domains
				"https://app.gohighlevel.com",
				"https://*.gohighlevel.com",
				"https://*.leadconnectorhq.com",
				"https://*.msgsndr.com",
				// White-label agency domains (custom CRM domains that embed the Custom Page)
				"https://app.minflow.co",
				"https://*.minflow.co",
				"https://app.ministryflow.io",
				"https://*.ministryflow.io",
			].join(" ");
		return [
			{
				source: "/embedded/:path*",
				headers: [
					{
						key: "Content-Security-Policy",
						value: `frame-ancestors 'self' ${ghlFrameAncestors};`,
					},
				],
			},
		];
	},
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
