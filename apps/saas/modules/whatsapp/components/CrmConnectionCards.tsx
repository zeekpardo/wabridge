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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleXIcon, MessageSquareIcon } from "lucide-react";

import { openOAuthPopup } from "../lib/oauth-popup";

/**
 * The subaccount's CRM connection + provisioning summary cards. Lives in the Connections tab.
 */
export function CrmConnectionCards({ subaccountId }: { subaccountId: string }) {
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

	const sub = query.data;
	if (!sub) {
		return null;
	}

	return (
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
	);
}
