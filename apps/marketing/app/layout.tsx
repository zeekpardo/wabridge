import { config } from "@config";
import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

import "./globals.css";

export const metadata: Metadata = {
	// Resolves relative OG/Twitter image URLs (e.g. /opengraph-image.png) to
	// absolute ones. Set to the site's canonical URL in production.
	// `||` (not `??`) so an empty-string env value also falls back — dotenv files
	// set NEXT_PUBLIC_MARKETING_URL="" when unconfigured, which `new URL()` rejects.
	metadataBase: new URL(process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3001"),
	title: {
		absolute: config.appName,
		default: config.appName,
		template: `%s | ${config.appName}`,
	},
};

export default function RootLayout({ children }: PropsWithChildren) {
	return children;
}
