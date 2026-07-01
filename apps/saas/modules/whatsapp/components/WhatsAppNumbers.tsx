"use client";

import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { SmartphoneIcon } from "lucide-react";
import { ConnectNumberDialog } from "./ConnectNumberDialog";
import { SessionCard } from "./SessionCard";
import { isPending } from "./SessionStatusBadge";

export function WhatsAppNumbers() {
	const sessionsQuery = useQuery({
		...orpc.whatsapp.listSessions.queryOptions(),
		// Keep refreshing while any number is still coming up (QR / linking).
		refetchInterval: (query) =>
			(query.state.data ?? []).some((s) => isPending(s.status)) ? 3000 : false,
	});

	const sessions = sessionsQuery.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-medium text-lg">Connected numbers</h2>
					<p className="text-foreground/60 text-sm">
						WhatsApp numbers linked to this organization.
					</p>
				</div>
				<ConnectNumberDialog />
			</div>

			{sessionsQuery.isLoading ? (
				<div className="flex justify-center py-12">
					<Spinner className="size-6" />
				</div>
			) : sessions.length === 0 ? (
				<Card className="flex flex-col items-center gap-3 py-12 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
						<SmartphoneIcon className="size-6 text-primary" />
					</div>
					<div>
						<p className="font-medium">No numbers yet</p>
						<p className="text-foreground/60 text-sm">
							Connect your first WhatsApp number to start sending and receiving messages.
						</p>
					</div>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{sessions.map((session) => (
						<SessionCard key={session.id} session={session} />
					))}
				</div>
			)}
		</div>
	);
}
