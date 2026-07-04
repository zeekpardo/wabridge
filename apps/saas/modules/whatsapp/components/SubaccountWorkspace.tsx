"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon } from "lucide-react";
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
					<p className="text-xs text-foreground/65">{sub.id}</p>
				</div>
			</div>

			<WhatsAppTabs subaccountId={subaccountId} />
		</div>
	);
}
