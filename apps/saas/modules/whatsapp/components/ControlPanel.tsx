"use client";

import { GHL_PROVISION_INTENT_KEY } from "@repo/api/modules/whatsapp/ghl-constants";
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
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowUpRightIcon,
	KeyRoundIcon,
	PencilLineIcon,
	PlusIcon,
	ServerIcon,
	Trash2Icon,
	UsersIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { openOAuthPopup } from "../lib/oauth-popup";

export function ControlPanel({ organizationSlug }: { organizationSlug: string }) {
	const query = useQuery(orpc.subaccounts.list.queryOptions({ input: {} }));

	if (query.isLoading) {
		return (
			<div className="py-16 flex justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	const subaccounts = query.data?.subaccounts ?? [];
	const limits = query.data?.limits;

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-4 md:grid-cols-3 grid grid-cols-1">
				<StatCard
					icon={<UsersIcon className="size-5 text-primary" />}
					label="Subaccounts"
					value={`${limits?.subaccountsUsed ?? 0}`}
					sub={limits?.subaccountsMax != null ? `/ ${limits.subaccountsMax}` : ""}
				>
					<div className="gap-1.5 flex items-center">
						<Badge status="info">GHL: {limits?.ghlConnected ?? 0}</Badge>
					</div>
				</StatCard>

				<StatCard
					icon={<ServerIcon className="size-5 text-primary" />}
					label="Connections"
					value={`${limits?.connectionsTotal ?? 0}`}
					sub=""
				>
					<div className="gap-2 text-xs flex items-center">
						<span className="gap-1 text-emerald-600 flex items-center">
							<WifiIcon className="size-3.5" />
							{limits?.connectionsOnline ?? 0}
						</span>
						<span className="gap-1 text-red-500 flex items-center">
							<WifiOffIcon className="size-3.5" />
							{(limits?.connectionsTotal ?? 0) - (limits?.connectionsOnline ?? 0)}
						</span>
					</div>
				</StatCard>

				<Card className="gap-1 p-5 flex flex-col">
					<span className="font-semibold text-indigo-500 text-xs tracking-wide uppercase">Tip</span>
					<p className="font-medium text-sm">Provision from GoHighLevel</p>
					<p className="text-xs leading-snug text-foreground/75">
						Add a subaccount → <strong>Connect GoHighLevel</strong> to pull a location in directly.
						Its name and ID come from GHL. Or create one manually.
					</p>
				</Card>
			</div>

			<div className="gap-3 flex flex-col">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-xl">Subaccounts</h3>
					<span className="text-xs text-foreground/65">
						Showing {subaccounts.length} of {limits?.subaccountsUsed ?? subaccounts.length}
					</span>
				</div>

				<div className="gap-4 md:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
					{subaccounts.map((sub) => (
						<SubaccountCard
							key={sub.id}
							subaccount={sub}
							href={`/${organizationSlug}/whatsapp/${sub.id}`}
							embeddedHref={`/embedded/${organizationSlug}/whatsapp/${sub.id}`}
						/>
					))}
					<AddSubaccountCard />
				</div>
			</div>
		</div>
	);
}

function StatCard({
	icon,
	label,
	value,
	sub,
	children,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	sub: string;
	children?: React.ReactNode;
}) {
	return (
		<Card className="gap-3 p-5 flex flex-col">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-foreground/75">{label}</p>
					<p className="font-bold text-3xl">
						{value}
						{sub ? <span className="text-lg text-foreground/65"> {sub}</span> : null}
					</p>
				</div>
				<div className="size-11 flex items-center justify-center rounded-xl bg-primary/10">
					{icon}
				</div>
			</div>
			{children}
		</Card>
	);
}

interface SubaccountStat {
	id: string;
	name: string;
	status: string;
	provisioningSource: string;
	ghlLocationId?: string | null;
	ghlConnected: boolean;
	connectionsOnline: number;
	connectionsOffline: number;
	connectionsTotal: number;
}

function SubaccountCard({
	subaccount,
	href,
	embeddedHref,
}: {
	subaccount: SubaccountStat;
	href: string;
	embeddedHref: string;
}) {
	const queryClient = useQueryClient();
	const remove = useMutation(
		orpc.subaccounts.delete.mutationOptions({
			onSuccess: () => {
				toastSuccess("Subaccount deleted");
				void queryClient.invalidateQueries({ queryKey: orpc.subaccounts.list.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not delete subaccount"),
		}),
	);

	return (
		<Card className="gap-3 p-5 hover:-translate-y-0.5 hover:shadow-lg flex flex-col transition-all hover:border-primary/50">
			<div className="gap-2 flex items-start justify-between">
				<div className="min-w-0">
					<h4 className="font-semibold text-base truncate">{subaccount.name}</h4>
					{subaccount.ghlLocationId ? (
						<p className="text-xs truncate text-foreground/65" title={subaccount.ghlLocationId}>
							Location ID: {subaccount.ghlLocationId}
						</p>
					) : (
						<p className="text-xs truncate text-foreground/65">{subaccount.id}</p>
					)}
				</div>
			</div>

			<div className="gap-1.5 flex flex-wrap items-center">
				<Badge status={subaccount.status === "active" ? "success" : "warning"}>
					{subaccount.status === "active" ? "Active" : "Paused"}
				</Badge>
				{subaccount.ghlConnected ? <Badge status="info">GHL</Badge> : null}
				<Badge>{subaccount.provisioningSource === "ghl" ? "GHL-linked" : "Manual"}</Badge>
			</div>

			<div className="gap-3 px-3 py-2 text-xs flex items-center rounded-lg bg-muted/50">
				<span className="gap-1.5 text-emerald-600 flex flex-1 items-center justify-center">
					<WifiIcon className="size-3.5" />
					{subaccount.connectionsOnline}
				</span>
				<div className="h-4 w-px bg-border" />
				<span className="gap-1.5 text-red-500 flex flex-1 items-center justify-center">
					<WifiOffIcon className="size-3.5" />
					{subaccount.connectionsOffline}
				</span>
				<div className="h-4 w-px bg-border" />
				<span className="gap-1.5 flex flex-1 items-center justify-center text-foreground/75">
					{subaccount.connectionsTotal} total
				</span>
			</div>

			<div className="gap-2 flex">
				<Button asChild size="sm" className="gap-1.5 flex-1">
					<a href={embeddedHref} target="_blank" rel="noopener noreferrer">
						<KeyRoundIcon className="size-3.5" />
						Autologin
					</a>
				</Button>
				<Button asChild size="sm" variant="outline" aria-label="Open subaccount">
					<Link href={href}>
						<ArrowUpRightIcon className="size-4" />
					</Link>
				</Button>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							className="text-red-600 hover:text-red-600"
							aria-label="Delete subaccount"
						>
							<Trash2Icon className="size-4" />
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete "{subaccount.name}"?</AlertDialogTitle>
							<AlertDialogDescription>
								This permanently removes the subaccount and all of its WhatsApp conversations,
								messages, and GoHighLevel link. Disconnect its numbers first. This can't be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className="bg-red-600 text-white hover:bg-red-600/90"
								onClick={() => remove.mutate({ id: subaccount.id })}
							>
								Delete subaccount
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</Card>
	);
}

function AddSubaccountCard() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"choose" | "manual">("choose");
	const [name, setName] = useState("");
	const [connecting, setConnecting] = useState(false);

	function refreshList() {
		void queryClient.invalidateQueries({ queryKey: orpc.subaccounts.list.key() });
	}

	function resetAndClose() {
		setName("");
		setMode("choose");
		setOpen(false);
	}

	const create = useMutation(
		orpc.subaccounts.create.mutationOptions({
			onSuccess: () => {
				refreshList();
				resetAndClose();
			},
			onError: (error) => toastError(error.message ?? "Could not create subaccount"),
		}),
	);

	const provisionUrl = useMutation(orpc.whatsapp.getGhlProvisionUrl.mutationOptions());

	async function connectGoHighLevel() {
		setConnecting(true);
		// Carry the provision intent across the OAuth round-trip: GHL drops our
		// `state` sentinel when the app is already installed on a location, so the
		// callback also honours this flag to provision rather than show the picker.
		window.localStorage.setItem(GHL_PROVISION_INTENT_KEY, "1");
		try {
			const { url } = await provisionUrl.mutateAsync({});
			const result = await openOAuthPopup(url);
			if (result.success) {
				refreshList();
				resetAndClose();
			} else if (result.error) {
				toastError(result.error);
			}
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not start GoHighLevel connect");
		} finally {
			// Clear it here too, in case the popup closed before reaching the callback.
			window.localStorage.removeItem(GHL_PROVISION_INTENT_KEY);
			setConnecting(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setName("");
					setMode("choose");
				}
			}}
		>
			<DialogTrigger asChild>
				<button
					type="button"
					className="min-h-40 gap-3 p-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 text-center transition-colors hover:border-primary/50"
				>
					<div className="size-12 flex items-center justify-center rounded-xl bg-primary/10">
						<PlusIcon className="size-6 text-primary" />
					</div>
					<p className="font-medium text-sm text-foreground/75">Add new subaccount</p>
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				{mode === "choose" ? (
					<>
						<DialogHeader>
							<DialogTitle>Add a subaccount</DialogTitle>
							<DialogDescription>
								Connect a GoHighLevel location, or create a manual subaccount.
							</DialogDescription>
						</DialogHeader>
						<div className="gap-2 flex flex-col">
							<Button loading={connecting} onClick={connectGoHighLevel}>
								<ArrowUpRightIcon className="mr-1.5 size-4" />
								Connect GoHighLevel
							</Button>
							<p className="px-1 text-xs text-foreground/60">
								Authorize a location — we name the subaccount after it and keep it in sync. The
								Location ID is shown on the card.
							</p>
							<Button variant="outline" disabled={connecting} onClick={() => setMode("manual")}>
								<PencilLineIcon className="mr-1.5 size-4" />
								Create manually
							</Button>
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Create a manual subaccount</DialogTitle>
							<DialogDescription>
								You can connect its WhatsApp numbers and a GoHighLevel location later from its
								management page.
							</DialogDescription>
						</DialogHeader>
						<div className="gap-1.5 flex flex-col">
							<Label htmlFor="sub-name">Name</Label>
							<Input
								id="sub-name"
								// oxlint-disable-next-line no-autofocus
								autoFocus
								placeholder="e.g. Acme Dental — Main"
								value={name}
								onChange={(e) => setName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && name.trim()) {
										create.mutate({ name: name.trim(), provisioningSource: "manual" });
									}
								}}
							/>
						</div>
						<DialogFooter className="sm:justify-between">
							<Button variant="ghost" onClick={() => setMode("choose")}>
								Back
							</Button>
							<Button
								disabled={!name.trim()}
								loading={create.isPending}
								onClick={() => create.mutate({ name: name.trim(), provisioningSource: "manual" })}
							>
								Create subaccount
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
