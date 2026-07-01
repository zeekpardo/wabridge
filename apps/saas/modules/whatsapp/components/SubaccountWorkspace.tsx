"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, CircleCheckIcon, CircleXIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";

import { WhatsAppTabs } from "./WhatsAppTabs";

export function SubaccountWorkspace({
	organizationSlug,
	subaccountId,
}: {
	organizationSlug: string;
	subaccountId: string;
}) {
	const query = useQuery(orpc.subaccounts.get.queryOptions({ input: { id: subaccountId } }));

	if (query.isLoading) {
		return (
			<div className="py-16 flex justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<Card className="gap-3 py-12 flex flex-col items-center text-center">
				<p className="font-medium">Subaccount not found</p>
				<Button asChild variant="outline" size="sm">
					<Link href={`/${organizationSlug}/whatsapp`}>Back to Control Panel</Link>
				</Button>
			</Card>
		);
	}

	const sub = query.data;

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-2 flex items-center">
				<Button asChild variant="ghost" size="icon" aria-label="Back to Control Panel">
					<Link href={`/${organizationSlug}/whatsapp`}>
						<ChevronLeftIcon className="size-4" />
					</Link>
				</Button>
				<div>
					<h2 className="font-bold text-2xl">{sub.name}</h2>
					<p className="text-xs text-foreground/50">{sub.id}</p>
				</div>
			</div>

			<div className="gap-4 md:grid-cols-2 grid grid-cols-1">
				<Card className="gap-3 p-4 flex items-center">
					<div
						className={`size-10 flex items-center justify-center rounded-lg ${sub.ghl.connected ? "bg-emerald-500/10" : "bg-muted"}`}
					>
						{sub.ghl.connected ? (
							<CircleCheckIcon className="size-5 text-emerald-500" />
						) : (
							<CircleXIcon className="size-5 text-foreground/40" />
						)}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-xs text-foreground/60">CRM connection</p>
						<p className="font-bold text-lg">{sub.ghl.connected ? "Connected" : "Not connected"}</p>
					</div>
					<Button asChild size="sm" variant={sub.ghl.connected ? "outline" : "primary"}>
						<a href={`/api/ghl/oauth/authorize?subaccountId=${subaccountId}`}>
							{sub.ghl.connected ? "Reconnect" : "Connect GoHighLevel"}
						</a>
					</Button>
				</Card>

				<Card className="gap-3 p-4 flex items-center">
					<div className="size-10 flex items-center justify-center rounded-lg bg-primary/10">
						<MessageSquareIcon className="size-5 text-primary" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-xs text-foreground/60">Provisioning</p>
						<p className="font-bold text-lg capitalize">
							{sub.provisioningSource === "ghl" ? "GHL-linked" : "Manual"}
						</p>
					</div>
				</Card>
			</div>

			<WhatsAppTabs subaccountId={subaccountId} />
		</div>
	);
}
