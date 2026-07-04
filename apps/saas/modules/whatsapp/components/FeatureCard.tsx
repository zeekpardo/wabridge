"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Switch } from "@repo/ui/components/switch";
import type { ReactNode } from "react";

interface FeatureCardProps {
	/** A lucide icon element, sized by the card (rendered ~size-4). */
	icon: ReactNode;
	/** Tailwind classes for the icon tile (e.g. "bg-orange-500/10 text-orange-500"). */
	accentClassName?: string;
	title: string;
	description: string;
	/** A status pill shown top-right (mutually exclusive with `toggle`). */
	status?: { label: string; tone: "success" | "muted" };
	/** An on/off switch shown top-right (mutually exclusive with `status`). */
	toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
	/** The bottom action (e.g. "Configure") — opens the feature's modal. */
	action?: { label: string; onClick: () => void };
}

const TONE: Record<"success" | "muted", string> = {
	success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
	muted: "bg-muted text-muted-foreground",
};

/**
 * A settings feature tile: icon, a status pill or on/off switch, title, blurb, and an action button
 * that opens the feature's configuration modal. Mirrors the card-grid settings pattern.
 */
export function FeatureCard({
	icon,
	accentClassName,
	title,
	description,
	status,
	toggle,
	action,
}: FeatureCardProps) {
	return (
		<Card className="gap-0 p-3 hover:shadow-md flex h-full flex-col transition-all hover:border-primary/40">
			<div className="mb-2 flex items-start justify-between">
				<div
					className={cn(
						"size-8 flex items-center justify-center rounded-md bg-muted",
						accentClassName,
					)}
				>
					{icon}
				</div>
				{toggle ? (
					<Switch
						checked={toggle.checked}
						disabled={toggle.disabled}
						onCheckedChange={toggle.onChange}
						aria-label={`Toggle ${title}`}
					/>
				) : status ? (
					<span
						className={cn("px-2 py-0.5 font-medium rounded-full text-[10px]", TONE[status.tone])}
					>
						{status.label}
					</span>
				) : null}
			</div>

			<h4 className="mb-0.5 text-sm font-semibold leading-tight">{title}</h4>
			<p className="mb-2 leading-snug line-clamp-2 text-[11px] text-muted-foreground">
				{description}
			</p>

			{action ? (
				<Button
					variant="outline"
					size="sm"
					className="h-7 text-xs mt-auto w-full"
					onClick={action.onClick}
				>
					{action.label}
				</Button>
			) : null}
		</Card>
	);
}
