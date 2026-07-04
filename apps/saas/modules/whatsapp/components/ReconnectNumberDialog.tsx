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
import { RefreshCwIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { SessionStatusBadge, isConnected } from "./SessionStatusBadge";

/**
 * Re-link an EXISTING WhatsApp number that dropped (auth invalidated / connection lost). Unlike
 * ConnectNumberDialog (which creates a NEW session), this reconnects the given sessionId: on open it
 * asks the gateway to restart any dropped session (reconcile) so a fresh QR is generated, then polls
 * the live status + QR for THIS session. A session already sitting in qr_ready shows its QR immediately.
 */
export function ReconnectNumberDialog({
	sessionId,
	subaccountId,
	label,
}: {
	sessionId: string;
	subaccountId?: string;
	label?: string | null;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [phone, setPhone] = useState("");
	const [pairingCode, setPairingCode] = useState<string | null>(null);
	const [restarted, setRestarted] = useState(false);

	// Restart dropped sessions so the gateway (re)generates a QR. No-op for a session already in
	// qr_ready/authenticating; harmless for the others.
	const reconcile = useMutation(
		orpc.whatsapp.reconcileConnections.mutationOptions({
			onError: (error) => toastError(error.message ?? "Could not restart the connection"),
		}),
	);

	// Live status — poll while the session is still coming up.
	const sessionQuery = useQuery({
		...orpc.whatsapp.getSession.queryOptions({ input: { id: sessionId, subaccountId } }),
		enabled: open,
		refetchInterval: (query) => (isConnected(query.state.data?.status ?? "") ? false : 2500),
	});

	const status = sessionQuery.data?.status ?? "disconnected";
	const connected = isConnected(status);

	// QR — poll while the session is waiting to be scanned.
	const qrQuery = useQuery({
		...orpc.whatsapp.getQr.queryOptions({ input: { id: sessionId, subaccountId } }),
		enabled: open && !connected,
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
		if (next && !restarted) {
			// Kick a restart once per open so a fully-dropped session begins emitting a QR.
			setRestarted(true);
			reconcile.mutate({ subaccountId });
		}
		if (!next) {
			setPhone("");
			setPairingCode(null);
			setRestarted(false);
		}
	}

	// When the session flips to connected, refresh the list once.
	useEffect(() => {
		if (connected) {
			void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
		}
	}, [connected, queryClient]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<RefreshCwIcon className="mr-1.5 size-4" />
					Reconnect
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reconnect {label || "this number"}</DialogTitle>
					<DialogDescription>
						Re-link this WhatsApp number by scanning a fresh QR code or using a pairing code.
					</DialogDescription>
				</DialogHeader>

				{connected ? (
					<div className="gap-3 py-6 flex flex-col items-center text-center">
						<div className="size-12 bg-emerald-500/10 flex items-center justify-center rounded-full">
							<SmartphoneIcon className="size-6 text-emerald-500" />
						</div>
						<p className="font-medium">
							Connected{sessionQuery.data?.phone ? ` — ${sessionQuery.data.phone}` : ""}
						</p>
						<p className="text-sm text-foreground/75">This number is linked and ready.</p>
						<Button
							onClick={() => {
								toastSuccess("WhatsApp number reconnected");
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
									On your phone: WhatsApp → Settings → Linked Devices → Link a Device, then scan. The
									code refreshes automatically.
								</p>
							</div>
						</TabsContent>

						<TabsContent value="pairing">
							<div className="gap-3 py-2 flex flex-col">
								<div className="gap-1.5 flex flex-col">
									<Label htmlFor={`wa-reconnect-phone-${sessionId}`}>
										Phone number (digits only, with country code)
									</Label>
									<Input
										id={`wa-reconnect-phone-${sessionId}`}
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
									onClick={() => pairing.mutate({ id: sessionId, phoneNumber: phone, subaccountId })}
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
