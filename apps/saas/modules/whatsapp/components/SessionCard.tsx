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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { SessionStatusBadge, isConnected } from "./SessionStatusBadge";

interface SessionRow {
	id: string;
	label?: string | null;
	phone?: string | null;
	openwaName: string;
	status: string;
}

export function SessionCard({ session }: { session: SessionRow }) {
	const queryClient = useQueryClient();
	const connected = isConnected(session.status);

	const remove = useMutation(
		orpc.whatsapp.deleteSession.mutationOptions({
			onSuccess: () => {
				toastSuccess("Number removed");
				queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not remove the number"),
		}),
	);

	return (
		<Card className="flex items-center justify-between gap-4 p-4">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
					<SmartphoneIcon className="size-5 text-primary" />
				</div>
				<div>
					<p className="font-medium">{session.label || session.phone || "Unnamed number"}</p>
					<p className="text-foreground/60 text-sm">
						{session.phone ? session.phone : session.openwaName}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<SessionStatusBadge status={session.status} />

				{connected && <TestMessageDialog sessionId={session.id} />}

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
								This unlinks the WhatsApp session from WABridge. You can reconnect by scanning a new QR
								code.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => remove.mutate({ id: session.id })}>
								Remove
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</Card>
	);
}

function TestMessageDialog({ sessionId }: { sessionId: string }) {
	const [open, setOpen] = useState(false);
	const [toPhone, setToPhone] = useState("");
	const [text, setText] = useState("");

	const messagesQuery = useQuery({
		...orpc.whatsapp.listMessages.queryOptions({ input: { id: sessionId, limit: 20 } }),
		enabled: open,
	});

	const send = useMutation(
		orpc.whatsapp.sendTestMessage.mutationOptions({
			onSuccess: () => {
				toastSuccess("Message sent");
				setText("");
				messagesQuery.refetch();
			},
			onError: (error) => toastError(error.message ?? "Could not send the message"),
		}),
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" size="sm">
					<SendIcon className="mr-1.5 size-3.5" />
					Test
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send a test WhatsApp message</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="to-phone">To (digits, country code)</Label>
						<Input
							id="to-phone"
							inputMode="numeric"
							placeholder="15555550100"
							value={toPhone}
							onChange={(e) => setToPhone(e.target.value.replace(/\D/g, ""))}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="msg-text">Message</Label>
						<Input
							id="msg-text"
							placeholder="Hello from WABridge 👋"
							value={text}
							onChange={(e) => setText(e.target.value)}
						/>
					</div>
					<Button
						disabled={toPhone.length < 8 || text.length === 0}
						loading={send.isPending}
						onClick={() => send.mutate({ id: sessionId, toPhone, text })}
					>
						Send
					</Button>

					{messagesQuery.data && messagesQuery.data.length > 0 && (
						<div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
							{messagesQuery.data.map((m) => (
								<div
									key={m.id}
									className={`rounded-md px-2 py-1 text-sm ${
										m.direction === "outbound"
											? "self-end bg-primary/10 text-right"
											: "self-start bg-muted"
									}`}
								>
									{m.body ?? `[${m.type}]`}
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
