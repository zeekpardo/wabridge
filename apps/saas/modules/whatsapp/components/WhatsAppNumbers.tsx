"use client";

import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { SmartphoneIcon } from "lucide-react";

import { ConnectNumberDialog } from "./ConnectNumberDialog";
import { SessionCard } from "./SessionCard";
import { isPending } from "./SessionStatusBadge";

export function WhatsAppNumbers({ subaccountId }: { subaccountId?: string }) {
	const sessionsQuery = useQuery({
		...orpc.whatsapp.listSessions.queryOptions({ input: { subaccountId } }),
		// Keep refreshing while any number is still coming up (QR / linking).
		refetchInterval: (query) =>
			(query.state.data ?? []).some((s) => isPending(s.status)) ? 3000 : false,
	});

	const sessions = sessionsQuery.data ?? [];

	return (
		<div className="gap-4 flex flex-col">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-medium text-lg">Connected numbers</h2>
					<p className="text-sm text-foreground/60">WhatsApp numbers linked to this subaccount.</p>
				</div>
				<ConnectNumberDialog subaccountId={subaccountId} />
			</div>

			{sessionsQuery.isLoading ? (
				<div className="py-12 flex justify-center">
					<Spinner className="size-6" />
				</div>
			) : sessions.length === 0 ? (
				<Card className="gap-3 py-12 flex flex-col items-center text-center">
					<div className="size-12 flex items-center justify-center rounded-full bg-primary/10">
						<SmartphoneIcon className="size-6 text-primary" />
					</div>
					<div>
						<p className="font-medium">No numbers yet</p>
						<p className="text-sm text-foreground/60">
							Connect your first WhatsApp number to start sending and receiving messages.
						</p>
					</div>
				</Card>
			) : (
				<div className="gap-3 flex flex-col">
					{sessions.map((session) => (
						<SessionCard key={session.id} session={session} subaccountId={subaccountId} />
					))}
				</div>
			)}
		</div>
	);
}
