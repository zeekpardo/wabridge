"use client";

import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { SessionStatusBadge, isConnected } from "./SessionStatusBadge";

export function ConnectNumberDialog({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [phone, setPhone] = useState("");
	const [pairingCode, setPairingCode] = useState<string | null>(null);

	function reset() {
		setLabel("");
		setSessionId(null);
		setPhone("");
		setPairingCode(null);
	}

	const connect = useMutation(
		orpc.whatsapp.connectNumber.mutationOptions({
			onSuccess: (row) => {
				setSessionId(row.id);
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not start a session"),
		}),
	);

	// Live status — poll while the session is still coming up.
	const sessionQuery = useQuery({
		...orpc.whatsapp.getSession.queryOptions({ input: { id: sessionId ?? "", subaccountId } }),
		enabled: !!sessionId,
		refetchInterval: (query) => (isConnected(query.state.data?.status ?? "") ? false : 2500),
	});

	const status = sessionQuery.data?.status ?? "created";
	const connected = isConnected(status);

	// QR — poll while the session is waiting to be scanned.
	const qrQuery = useQuery({
		...orpc.whatsapp.getQr.queryOptions({ input: { id: sessionId ?? "", subaccountId } }),
		enabled: !!sessionId && !connected,
		refetchInterval: connected ? false : 2500,
	});

	const pairing = useMutation(
		orpc.whatsapp.requestPairingCode.mutationOptions({
			onSuccess: (res) => setPairingCode((res as { pairingCode?: string })?.pairingCode ?? "—"),
			onError: (error) => toastError(error.message ?? "Could not request a pairing code"),
		}),
	);

	function onOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			reset();
		}
	}

	// When the session flips to connected, refresh the list once.
	useEffect(() => {
		if (connected && sessionId) {
			void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
		}
	}, [connected, sessionId, queryClient]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon className="mr-1.5 size-4" />
					Connect number
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Connect a WhatsApp number</DialogTitle>
					<DialogDescription>
						Links a WhatsApp account to this organization via the WABridge engine.
					</DialogDescription>
				</DialogHeader>

				{!sessionId ? (
					<div className="gap-4 flex flex-col">
						<div className="gap-1.5 flex flex-col">
							<Label htmlFor="wa-label">Label (optional)</Label>
							<Input
								id="wa-label"
								placeholder="e.g. Front desk, Sales line"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
						<Button
							onClick={() => connect.mutate({ label: label || undefined, subaccountId })}
							loading={connect.isPending}
						>
							Start & show QR
						</Button>
					</div>
				) : connected ? (
					<div className="gap-3 py-6 flex flex-col items-center text-center">
						<div className="size-12 bg-emerald-500/10 flex items-center justify-center rounded-full">
							<SmartphoneIcon className="size-6 text-emerald-500" />
						</div>
						<p className="font-medium">
							Connected{sessionQuery.data?.phone ? ` — ${sessionQuery.data.phone}` : ""}
						</p>
						<p className="text-sm text-foreground/75">This number is now linked and ready.</p>
						<Button
							onClick={() => {
								toastSuccess("WhatsApp number connected");
								onOpenChange(false);
							}}
						>
							Done
						</Button>
					</div>
				) : (
					<Tabs defaultValue="qr">
						<TabsList className="w-full">
							<TabsTrigger value="qr" className="flex-1">
								QR code
							</TabsTrigger>
							<TabsTrigger value="pairing" className="flex-1">
								Phone number
							</TabsTrigger>
						</TabsList>

						<TabsContent value="qr">
							<div className="gap-3 py-2 flex flex-col items-center">
								<div className="gap-2 text-sm flex items-center">
									<span className="text-foreground/75">Status:</span>
									<SessionStatusBadge status={status} />
								</div>
								<div className="size-64 bg-white p-2 flex items-center justify-center rounded-lg border">
									{qrQuery.data?.qrCode ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={qrQuery.data.qrCode} alt="WhatsApp QR code" className="size-full" />
									) : (
										<Spinner className="size-6" />
									)}
								</div>
								<p className="max-w-xs text-xs text-center text-foreground/75">
									On your phone: WhatsApp → Settings → Linked Devices → Link a Device, then scan.
									The code refreshes automatically.
								</p>
							</div>
						</TabsContent>

						<TabsContent value="pairing">
							<div className="gap-3 py-2 flex flex-col">
								<div className="gap-1.5 flex flex-col">
									<Label htmlFor="wa-phone">Phone number (digits only, with country code)</Label>
									<Input
										id="wa-phone"
										inputMode="numeric"
										placeholder="15555550100"
										value={phone}
										onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
									/>
								</div>
								<Button
									variant="secondary"
									disabled={phone.length < 8}
									loading={pairing.isPending}
									onClick={() =>
										sessionId && pairing.mutate({ id: sessionId, phoneNumber: phone, subaccountId })
									}
								>
									Get pairing code
								</Button>
								{pairingCode && (
									<div className="p-3 rounded-lg border text-center">
										<p className="text-xs text-foreground/75">
											Enter this code in WhatsApp → Link a Device → Link with phone number
										</p>
										<p className="mt-1 font-mono text-2xl tracking-widest">{pairingCode}</p>
									</div>
								)}
							</div>
						</TabsContent>
					</Tabs>
				)}
			</DialogContent>
		</Dialog>
	);
}
