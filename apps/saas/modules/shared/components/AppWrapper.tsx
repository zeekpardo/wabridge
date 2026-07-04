"use client";

import { cn } from "@repo/ui";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

import { SidebarProvider, useSidebar } from "../lib/sidebar-context";
import { NavBar } from "./NavBar";

function AppContent({ children }: PropsWithChildren) {
	const { isCollapsed } = useSidebar();
	const pathname = usePathname();
	// The WhatsApp control panel is data-dense (inbox, group lists) and reads better wide: drop the
	// centered max-width and halve the container's horizontal padding (1.5rem -> 0.75rem).
	const isWhatsApp = pathname?.split("/").includes("whatsapp") ?? false;

	return (
		<div className="md:h-screen md:overflow-hidden bg-background">
			<NavBar />
			<div
				className={cn("md:py-2 md:pr-2 flex h-screen", {
					"md:ml-[280px]": !isCollapsed,
					"md:ml-[80px]": isCollapsed,
				})}
			>
				<main className="md:border md:rounded-2xl md:overflow-y-auto py-6 h-full w-full border-t bg-card">
					<div className={isWhatsApp ? "px-3 w-full" : "container"}>{children}</div>
				</main>
			</div>
		</div>
	);
}

export function AppWrapper({ children }: PropsWithChildren) {
	return (
		<SidebarProvider>
			<AppContent>{children}</AppContent>
		</SidebarProvider>
	);
}
