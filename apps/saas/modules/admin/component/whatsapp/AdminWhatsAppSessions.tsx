"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SessionStatusBadge } from "@whatsapp/components/SessionStatusBadge";
import { RefreshCwIcon } from "lucide-react";

export function AdminWhatsAppSessions() {
	const sessionsQuery = useQuery(orpc.whatsapp.adminListSessions.queryOptions());

	const reconcile = useMutation(
		orpc.whatsapp.reconcileSessions.mutationOptions({
			onSuccess: (summary) => {
				toastSuccess(
					`Reconciled ${summary.checked} · restarted ${summary.restarted} · need re-link ${summary.needsReconnect}`,
				);
				void sessionsQuery.refetch();
			},
			onError: (error) => toastError(error.message ?? "Reconcile failed"),
		}),
	);

	const sessions = sessionsQuery.data ?? [];

	return (
		<div className="gap-4 flex flex-col">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-medium text-lg">All WhatsApp numbers</h2>
					<p className="text-sm text-foreground/60">
						Every organization's connected numbers across the platform.
					</p>
				</div>
				<Button
					variant="secondary"
					loading={reconcile.isPending}
					onClick={() => reconcile.mutate({})}
				>
					<RefreshCwIcon className="mr-1.5 size-4" />
					Reconcile all
				</Button>
			</div>

			{sessionsQuery.isLoading ? (
				<div className="py-12 flex justify-center">
					<Spinner className="size-6" />
				</div>
			) : sessions.length === 0 ? (
				<Card className="py-12 text-center">
					<p className="text-sm text-foreground/60">No WhatsApp numbers connected yet.</p>
				</Card>
			) : (
				<Card className="p-0 overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization</TableHead>
								<TableHead>Number</TableHead>
								<TableHead>Label</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Connected</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sessions.map((session) => (
								<TableRow key={session.id}>
									<TableCell className="font-medium">
										{session.organization?.name ?? session.organization?.slug ?? "—"}
									</TableCell>
									<TableCell>{session.phone ?? "—"}</TableCell>
									<TableCell className="text-foreground/70">{session.label ?? "—"}</TableCell>
									<TableCell>
										<SessionStatusBadge status={session.status} />
									</TableCell>
									<TableCell className="text-sm text-foreground/60">
										{session.connectedAt ? new Date(session.connectedAt).toLocaleDateString() : "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			)}
		</div>
	);
}
