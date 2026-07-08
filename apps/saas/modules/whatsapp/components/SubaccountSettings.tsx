"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Share2Icon,
	ShuffleIcon,
	SmartphoneIcon,
	TagIcon,
	TerminalIcon,
	UserXIcon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";

import { CommandBuilder } from "./CommandBuilder";
import { FeatureCard } from "./FeatureCard";
import { NoWhatsappTagEditor } from "./NoWhatsappTagEditor";
import { NumberAssignmentSettings } from "./NumberAssignmentSettings";
import { OwnerNumbersSettings } from "./OwnerNumbersSettings";
import { SpintaxEditor } from "./SpintaxEditor";
import { StaffTriggersEditor } from "./StaffTriggersEditor";

type Feature = "builder" | "spintax" | "owners" | "distribution" | "nowa" | "triggers";

/**
 * The subaccount Settings tab: a grid of feature cards, each configured in a popup modal, plus a
 * toggle to enable/disable the WhatsApp Groups feature.
 */
export function SubaccountSettings({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState<Feature | null>(null);

	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const groupsEnabled = settingsQuery.data?.groupsEnabled ?? false;

	const toggleGroups = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getSettings.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not update Groups"),
		}),
	);

	function setGroups(enabled: boolean) {
		toggleGroups.mutate(
			{ groupsEnabled: enabled, subaccountId },
			{ onSuccess: () => toastSuccess(enabled ? "Groups enabled" : "Groups disabled") },
		);
	}

	return (
		<>
			<div className="gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 grid grid-cols-1">
				<FeatureCard
					icon={<TerminalIcon className="size-4" />}
					accentClassName="bg-pink-500/10 text-pink-500"
					title="Command Builder"
					description="Build outgoing messages with tokens, spintax, delays and CRM merge fields."
					status={{ label: "Reference", tone: "muted" }}
					action={{ label: "Open", onClick: () => setOpen("builder") }}
				/>

				<FeatureCard
					icon={<ShuffleIcon className="size-4" />}
					accentClassName="bg-yellow-500/10 text-yellow-500"
					title="Global Spintax"
					description="Reusable spintax variables you can reference across messages in this subaccount."
					action={{ label: "Configure", onClick: () => setOpen("spintax") }}
				/>

				<FeatureCard
					icon={<SmartphoneIcon className="size-4" />}
					accentClassName="bg-sky-500/10 text-sky-500"
					title="Owner Numbers"
					description="Assign a default sending number per team member so new contacts spread across numbers."
					action={{ label: "Configure", onClick: () => setOpen("owners") }}
				/>

				<FeatureCard
					icon={<Share2Icon className="size-4" />}
					accentClassName="bg-emerald-500/10 text-emerald-500"
					title="Number Distribution"
					description="Evenly spread new contacts across your numbers instead of the owner's default — and backfill unassigned contacts."
					action={{ label: "Configure", onClick: () => setOpen("distribution") }}
				/>

				<FeatureCard
					icon={<UsersIcon className="size-4" />}
					accentClassName="bg-teal-500/10 text-teal-500"
					title="Groups"
					description="WhatsApp Groups inbox and management. Turn off to hide the Groups tab for this subaccount."
					toggle={{
						checked: groupsEnabled,
						onChange: setGroups,
						disabled: settingsQuery.isLoading || toggleGroups.isPending,
					}}
				/>

				<FeatureCard
					icon={<UserXIcon className="size-4" />}
					accentClassName="bg-rose-500/10 text-rose-500"
					title="No-WhatsApp tag"
					description="Tag contacts whose number isn't on WhatsApp so you can follow up another way."
					action={{ label: "Configure", onClick: () => setOpen("nowa") }}
				/>

				<FeatureCard
					icon={<TagIcon className="size-4" />}
					accentClassName="bg-violet-500/10 text-violet-500"
					title="Staff triggers"
					description="Auto-tag a contact when your outgoing message contains a keyword."
					action={{ label: "Configure", onClick: () => setOpen("triggers") }}
				/>
			</div>

			{/* Command Builder — wide, scrollable */}
			<Dialog open={open === "builder"} onOpenChange={(next) => setOpen(next ? "builder" : null)}>
				<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Command Builder</DialogTitle>
						<DialogDescription>
							Compose outgoing messages with tokens, spintax, delays and CRM merge fields.
						</DialogDescription>
					</DialogHeader>
					<CommandBuilder subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>

			{/* Global Spintax */}
			<Dialog open={open === "spintax"} onOpenChange={(next) => setOpen(next ? "spintax" : null)}>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Global Spintax</DialogTitle>
						<DialogDescription>Reusable variations for this subaccount.</DialogDescription>
					</DialogHeader>
					<SpintaxEditor subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>

			{/* Owner Numbers */}
			<Dialog open={open === "owners"} onOpenChange={(next) => setOpen(next ? "owners" : null)}>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Owner Numbers</DialogTitle>
						<DialogDescription>
							Assign a default sending number to each team member.
						</DialogDescription>
					</DialogHeader>
					<OwnerNumbersSettings subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>

			{/* Number Distribution */}
			<Dialog
				open={open === "distribution"}
				onOpenChange={(next) => setOpen(next ? "distribution" : null)}
			>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Number Distribution</DialogTitle>
						<DialogDescription>
							Choose how new contacts are assigned a sending number, and backfill existing ones.
						</DialogDescription>
					</DialogHeader>
					<NumberAssignmentSettings subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>

			{/* No-WhatsApp tag */}
			<Dialog open={open === "nowa"} onOpenChange={(next) => setOpen(next ? "nowa" : null)}>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>No-WhatsApp tag</DialogTitle>
						<DialogDescription>
							Tag contacts whose number isn't on WhatsApp so you can follow up another way.
						</DialogDescription>
					</DialogHeader>
					<NoWhatsappTagEditor subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>

			{/* Staff triggers */}
			<Dialog open={open === "triggers"} onOpenChange={(next) => setOpen(next ? "triggers" : null)}>
				<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Staff triggers</DialogTitle>
						<DialogDescription>
							Auto-tag a contact when your outgoing message contains a keyword.
						</DialogDescription>
					</DialogHeader>
					<StaffTriggersEditor subaccountId={subaccountId} />
				</DialogContent>
			</Dialog>
		</>
	);
}
