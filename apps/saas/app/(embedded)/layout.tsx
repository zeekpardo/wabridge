import type { PropsWithChildren } from "react";

/**
 * Chrome-less layout for pages embedded as GoHighLevel Custom Pages (rendered
 * inside a GHL iframe). No app nav/header — just the feature, full-bleed.
 */
export default function EmbeddedLayout({ children }: PropsWithChildren) {
	return <div className="h-[100dvh] w-full overflow-hidden bg-background">{children}</div>;
}
