"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SmartphoneIcon, Trash2Icon } from "lucide-react";

import { CommandTester } from "./CommandTester";
import { SessionStatusBadge, isConnected } from "./SessionStatusBadge";

interface SessionRow {
	id: string;
	label?: string | null;
	phone?: string | null;
	openwaName: string;
	status: string;
}

export function SessionCard({
	session,
	subaccountId,
}: {
	session: SessionRow;
	subaccountId?: string;
}) {
	const queryClient = useQueryClient();
	const connected = isConnected(session.status);

	const remove = useMutation(
		orpc.whatsapp.deleteSession.mutationOptions({
			onSuccess: () => {
				toastSuccess("Number removed");
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not remove the number"),
		}),
	);

	return (
		<Card className="gap-4 p-4 flex items-center justify-between">
			<div className="gap-3 flex items-center">
				<div className="size-10 flex items-center justify-center rounded-full bg-primary/10">
					<SmartphoneIcon className="size-5 text-primary" />
				</div>
				<div>
					<p className="font-medium">{session.label || session.phone || "Unnamed number"}</p>
					<p className="text-sm text-foreground/75">
						{session.phone ? session.phone : session.openwaName}
					</p>
				</div>
			</div>

			<div className="gap-2 flex items-center">
				<SessionStatusBadge status={session.status} />

				{connected && <CommandTester sessionId={session.id} subaccountId={subaccountId} />}

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="ghost" size="icon" aria-label="Remove number">
							<Trash2Icon className="size-4" />
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remove this number?</AlertDialogTitle>
							<AlertDialogDescription>
								This unlinks the WhatsApp session from WABridge. You can reconnect by scanning a new
								QR code.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => remove.mutate({ id: session.id, subaccountId })}>
								Remove
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</Card>
	);
}
