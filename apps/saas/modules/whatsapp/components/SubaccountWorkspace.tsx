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
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, CircleCheckIcon, CircleXIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";

import { openOAuthPopup } from "../lib/oauth-popup";
import { WhatsAppTabs } from "./WhatsAppTabs";

export function SubaccountWorkspace({
	organizationSlug,
	subaccountId,
}: {
	organizationSlug: string;
	subaccountId: string;
}) {
	const queryClient = useQueryClient();
	const query = useQuery(orpc.subaccounts.get.queryOptions({ input: { id: subaccountId } }));

	const getUrl = useMutation(orpc.whatsapp.getGhlOAuthUrl.mutationOptions());

	const disconnect = useMutation(
		orpc.whatsapp.disconnectGoHighLevel.mutationOptions({
			onSuccess: () => {
				toastSuccess("GoHighLevel disconnected");
				void queryClient.invalidateQueries({ queryKey: orpc.subaccounts.get.key() });
			},
			onError: (error) =>
				toastError(error instanceof Error ? error.message : "Could not disconnect"),
		}),
	);

	async function connectGhl() {
		try {
			const { url } = await getUrl.mutateAsync({ subaccountId });
			const result = await openOAuthPopup(url);
			if (result.success) {
				toastSuccess("GoHighLevel connected");
				void queryClient.invalidateQueries({ queryKey: orpc.subaccounts.get.key() });
			} else if (result.error) {
				toastError(result.error);
			}
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not start GoHighLevel connect");
		}
	}

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

			<div className="gap-4 md:grid-cols-2 grid grid-cols-1">
				<Card className="gap-3 p-4 flex items-center">
					<div
						className={`size-10 flex items-center justify-center rounded-lg ${sub.ghl.connected ? "bg-emerald-500/10" : "bg-muted"}`}
					>
						{sub.ghl.connected ? (
							<CircleCheckIcon className="size-5 text-emerald-500" />
						) : (
							<CircleXIcon className="size-5 text-foreground/55" />
						)}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-xs text-foreground/75">CRM connection</p>
						<p className="font-bold text-lg">{sub.ghl.connected ? "Connected" : "Not connected"}</p>
					</div>
					<div className="gap-2 flex shrink-0 items-center">
						<Button
							size="sm"
							variant={sub.ghl.connected ? "outline" : "primary"}
							loading={getUrl.isPending}
							onClick={connectGhl}
						>
							{sub.ghl.connected ? "Reconnect" : "Connect GoHighLevel"}
						</Button>
						{sub.ghl.connected ? (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button size="sm" variant="ghost" className="text-destructive">
										Disconnect
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Disconnect GoHighLevel?</AlertDialogTitle>
										<AlertDialogDescription>
											Messages stop syncing to GoHighLevel and the SMS takeover goes quiet for this
											subaccount until you reconnect. WhatsApp numbers, conversations, and messages
											stay intact and keep working here.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction onClick={() => disconnect.mutate({ subaccountId })}>
											Disconnect
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						) : null}
					</div>
				</Card>

				<Card className="gap-3 p-4 flex items-center">
					<div className="size-10 flex items-center justify-center rounded-lg bg-primary/10">
						<MessageSquareIcon className="size-5 text-primary" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-xs text-foreground/75">Provisioning</p>
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
