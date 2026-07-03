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
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, PencilIcon, SmartphoneIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";

import { CommandTester } from "./CommandTester";
import { SessionStatusBadge, isConnected } from "./SessionStatusBadge";

interface SessionRow {
	id: string;
	label?: string | null;
	phone?: string | null;
	openwaName: string;
	status: string;
	/** Send priority (1 = highest; powers default routing + #switch|N). */
	priority?: number;
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

	const [editing, setEditing] = useState(false);
	const [label, setLabel] = useState(session.label ?? "");
	const [priority, setPriority] = useState(String(session.priority ?? 1));

	const invalidate = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });

	const remove = useMutation(
		orpc.whatsapp.deleteSession.mutationOptions({
			onSuccess: () => {
				toastSuccess("Number removed");
				invalidate();
			},
			onError: (error) => toastError(error.message ?? "Could not remove the number"),
		}),
	);

	const update = useMutation(
		orpc.whatsapp.updateNumber.mutationOptions({
			onSuccess: () => {
				toastSuccess("Number updated");
				invalidate();
				setEditing(false);
			},
			onError: (error) => toastError(error.message ?? "Could not update the number"),
		}),
	);

	function startEditing() {
		setLabel(session.label ?? "");
		setPriority(String(session.priority ?? 1));
		setEditing(true);
	}

	function save() {
		const parsed = Number.parseInt(priority, 10);
		update.mutate({
			id: session.id,
			subaccountId,
			label: label.trim(),
			...(Number.isFinite(parsed) && parsed >= 1 ? { priority: parsed } : {}),
		});
	}

	if (editing) {
		return (
			<Card className="gap-4 p-4 flex items-center justify-between">
				<div className="gap-3 flex flex-1 items-center">
					<div className="size-10 flex shrink-0 items-center justify-center rounded-full bg-primary/10">
						<SmartphoneIcon className="size-5 text-primary" />
					</div>
					<div className="gap-2 sm:flex-row sm:items-center flex flex-1 flex-col">
						<Input
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder={session.phone ?? "Name this number"}
							aria-label="Number name"
							className="sm:max-w-xs"
						/>
						<div className="gap-2 flex items-center">
							<label
								htmlFor={`priority-${session.id}`}
								className="text-sm whitespace-nowrap text-foreground/75"
							>
								Priority
							</label>
							<Input
								id={`priority-${session.id}`}
								type="number"
								min={1}
								value={priority}
								onChange={(e) => setPriority(e.target.value)}
								aria-label="Send priority"
								className="w-20"
							/>
						</div>
					</div>
				</div>

				<div className="gap-2 flex items-center">
					<Button size="sm" onClick={save} loading={update.isPending}>
						<CheckIcon className="size-4" />
						Save
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setEditing(false)}
						disabled={update.isPending}
					>
						<XIcon className="size-4" />
						Cancel
					</Button>
				</div>
			</Card>
		);
	}

	return (
		<Card className="gap-4 p-4 flex items-center justify-between">
			<div className="gap-3 flex items-center">
				<div className="size-10 flex items-center justify-center rounded-full bg-primary/10">
					<SmartphoneIcon className="size-5 text-primary" />
				</div>
				<div>
					<div className="gap-2 flex items-center">
						<p className="font-medium">{session.label || session.phone || "Unnamed number"}</p>
						{typeof session.priority === "number" && (
							<span className="px-2 py-0.5 font-medium text-xs rounded-full bg-muted text-foreground/70">
								#{session.priority}
								{session.priority === 1 ? " · default" : ""}
							</span>
						)}
					</div>
					<p className="text-sm text-foreground/75">
						{session.phone ? session.phone : session.openwaName}
					</p>
				</div>
			</div>

			<div className="gap-2 flex items-center">
				<SessionStatusBadge status={session.status} />

				{connected && <CommandTester sessionId={session.id} subaccountId={subaccountId} />}

				<Button variant="ghost" size="icon" aria-label="Edit number" onClick={startEditing}>
					<PencilIcon className="size-4" />
				</Button>

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
								This unlinks the WhatsApp session from WAGOAT. You can reconnect by scanning a new
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
