"use client";

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
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowUpRightIcon,
	PlusIcon,
	ServerIcon,
	UsersIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
					sub={`/ ${limits?.subaccountsMax ?? 0}`}
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
					<span className="font-semibold text-indigo-500 text-xs tracking-wide uppercase">New</span>
					<p className="font-medium text-sm">Provision from GoHighLevel</p>
					<p className="text-xs leading-snug text-foreground/60">
						Once your marketplace app is live, pull subaccounts straight from your GHL locations.
						Manual subaccounts work today.
					</p>
				</Card>
			</div>

			<div className="gap-3 flex flex-col">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-xl">Subaccounts</h3>
					<span className="text-xs text-foreground/50">
						Showing {subaccounts.length} of {limits?.subaccountsUsed ?? subaccounts.length}
					</span>
				</div>

				<div className="gap-4 md:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
					{subaccounts.map((sub) => (
						<SubaccountCard
							key={sub.id}
							subaccount={sub}
							href={`/${organizationSlug}/whatsapp/${sub.id}`}
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
					<p className="text-sm text-foreground/60">{label}</p>
					<p className="font-bold text-3xl">
						{value}
						{sub ? <span className="text-lg text-foreground/50"> {sub}</span> : null}
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
	ghlConnected: boolean;
	connectionsOnline: number;
	connectionsOffline: number;
	connectionsTotal: number;
}

function SubaccountCard({ subaccount, href }: { subaccount: SubaccountStat; href: string }) {
	return (
		<Card className="gap-3 p-5 hover:-translate-y-0.5 hover:shadow-lg flex flex-col transition-all hover:border-primary/50">
			<div className="gap-2 flex items-start justify-between">
				<div className="min-w-0">
					<h4 className="font-semibold text-base truncate">{subaccount.name}</h4>
					<p className="text-xs truncate text-foreground/50">{subaccount.id}</p>
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
				<span className="gap-1.5 flex flex-1 items-center justify-center text-foreground/60">
					{subaccount.connectionsTotal} total
				</span>
			</div>

			<Button asChild size="sm" className="gap-1.5">
				<Link href={href}>
					Open subaccount
					<ArrowUpRightIcon className="size-4" />
				</Link>
			</Button>
		</Card>
	);
}

function AddSubaccountCard() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	const create = useMutation(
		orpc.subaccounts.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.subaccounts.list.key() });
				setName("");
				setOpen(false);
			},
			onError: (error) => toastError(error.message ?? "Could not create subaccount"),
		}),
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="min-h-40 gap-3 p-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 text-center transition-colors hover:border-primary/50"
				>
					<div className="size-12 flex items-center justify-center rounded-xl bg-primary/10">
						<PlusIcon className="size-6 text-primary" />
					</div>
					<p className="font-medium text-sm text-foreground/60">Add new subaccount</p>
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add a subaccount</DialogTitle>
					<DialogDescription>
						Create a manual subaccount. You can connect its WhatsApp numbers and GoHighLevel
						location from its management page.
					</DialogDescription>
				</DialogHeader>
				<div className="gap-1.5 flex flex-col">
					<Label htmlFor="sub-name">Name</Label>
					<Input
						id="sub-name"
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
				<DialogFooter>
					<Button
						disabled={!name.trim()}
						loading={create.isPending}
						onClick={() => create.mutate({ name: name.trim(), provisioningSource: "manual" })}
					>
						Create subaccount
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
