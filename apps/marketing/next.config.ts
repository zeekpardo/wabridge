import { withContentCollections } from "@content-collections/next";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
	// Emit a self-contained server bundle (apps/marketing/.next/standalone/...) so
	// the Docker runtime image ships only what it needs. Required by the Railway
	// deploy (see Dockerfile.marketing / railway.marketing.toml).
	output: "standalone",
	transpilePackages: ["@repo/i18n", "@repo/ui"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "placehold.co",
			},
			{
				protocol: "https",
				hostname: "picsum.photos",
			},
		],
	},
};

export default withContentCollections(withNextIntl(nextConfig));
