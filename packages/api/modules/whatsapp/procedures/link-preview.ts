import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

export interface LinkPreview {
	url: string;
	title: string | null;
	description: string | null;
	image: string | null;
	siteName: string | null;
}

// Block obvious internal targets (basic SSRF guard).
function isPublicHttpUrl(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}
	const host = url.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host.endsWith(".local") ||
		host === "0.0.0.0" ||
		host === "::1" ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host)
	) {
		return null;
	}
	return url;
}

function metaContent(html: string, key: string): string | null {
	const patterns = [
		new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
		new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match?.[1]) {
			return decodeEntities(match[1]);
		}
	}
	return null;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/gi, "'");
}

export const linkPreview = protectedProcedure
	.route({
		method: "POST",
		path: "/whatsapp/link-preview",
		tags: ["WhatsApp"],
		summary: "Fetch Open Graph metadata for a URL",
		description: "Server-side link unfurl (title, description, image) for rich previews.",
	})
	.input(z.object({ url: z.string() }))
	.handler(async ({ input }): Promise<LinkPreview | null> => {
		const url = isPublicHttpUrl(input.url);
		if (!url) {
			return null;
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		try {
			const response = await fetch(url, {
				signal: controller.signal,
				redirect: "follow",
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; WABridge/1.0; +link-preview)",
					Accept: "text/html",
				},
			});
			if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) {
				return null;
			}
			// Read at most ~500KB — the <head> is all we need.
			const html = (await response.text()).slice(0, 500_000);

			const title =
				metaContent(html, "og:title") ??
				metaContent(html, "twitter:title") ??
				html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ??
				null;
			const description =
				metaContent(html, "og:description") ??
				metaContent(html, "twitter:description") ??
				metaContent(html, "description");
			let image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image") ?? null;
			if (image && !/^https?:\/\//i.test(image)) {
				try {
					image = new URL(image, url).toString();
				} catch {
					image = null;
				}
			}
			const siteName = metaContent(html, "og:site_name") ?? url.hostname.replace(/^www\./, "");

			if (!title && !image) {
				return null;
			}
			return { url: url.toString(), title, description, image, siteName };
		} catch {
			return null;
		} finally {
			clearTimeout(timeout);
		}
	});
