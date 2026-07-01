// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
	transpilePackages: ["@repo/api", "@repo/auth", "@repo/database", "@repo/ui"],
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
		// Allow only GoHighLevel (+ self) to embed the /embedded/* pages in an iframe.
		// Override the allowed hosts with GHL_FRAME_ANCESTORS (space-separated) for
		// white-label domains.
		const ghlFrameAncestors =
			process.env.GHL_FRAME_ANCESTORS ??
			"https://app.gohighlevel.com https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com";
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
