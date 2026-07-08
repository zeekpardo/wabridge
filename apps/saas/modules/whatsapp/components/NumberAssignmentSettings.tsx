"use client";

import { Button } from "@repo/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OwnerNumbersSettings } from "./OwnerNumbersSettings";

/**
 * Single config for how a new contact gets its sticky sending number. Only one mode is ever active, so
 * the picker swaps the config shown beneath it:
 *   - "owner"       → per-member default numbers (OwnerNumbersSettings)
 *   - "distributed" → even spread across numbers + a backfill for existing unassigned contacts
 * Either way, contacts who message in first — and everyone already assigned — keep their number.
 */
export function NumberAssignmentSettings({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const strategy: "owner" | "distributed" =
		settingsQuery.data?.numberAssignmentStrategy === "distributed" ? "distributed" : "owner";

	const updateStrategy = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getSettings.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not update assignment mode"),
		}),
	);

	const backfill = useMutation(
		orpc.whatsapp.backfillNumberAssignments.mutationOptions({
			onError: (error) => toastError(error.message ?? "Backfill failed"),
		}),
	);

	function setStrategy(next: "owner" | "distributed") {
		if (next === strategy) {
			return;
		}
		updateStrategy.mutate(
			{ numberAssignmentStrategy: next, subaccountId },
			{
				onSuccess: () =>
					toastSuccess(
						next === "distributed" ? "Evenly distributing new contacts" : "Using owner numbers",
					),
			},
		);
	}

	function runBackfill() {
		backfill.mutate(
			{ subaccountId },
			{
				onSuccess: (result) =>
					toastSuccess(
						result.assigned > 0
							? `Assigned ${result.assigned} contact${result.assigned === 1 ? "" : "s"}`
							: "No unassigned contacts to backfill",
					),
			},
		);
	}

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<p className="font-medium text-sm">How new contacts get a number</p>
				<Select
					value={strategy}
					onValueChange={(value) => setStrategy(value as "owner" | "distributed")}
					disabled={settingsQuery.isLoading || updateStrategy.isPending}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="owner">Owner numbers — the sender's default number</SelectItem>
						<SelectItem value="distributed">Evenly distributed — least-loaded number</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-sm text-muted-foreground">
					{strategy === "distributed"
						? "New contacts you start are assigned the least-loaded number, so they spread evenly across your numbers."
						: "New contacts you start use the sending member's default number, set below."}
				</p>
			</div>

			<div className="pt-4 border-t">
				{strategy === "owner" ? (
					<OwnerNumbersSettings subaccountId={subaccountId} />
				) : (
					<div className="space-y-3">
						<div className="space-y-1">
							<p className="font-medium text-sm">Backfill existing contacts</p>
							<p className="text-sm text-muted-foreground">
								Assign a number to every contact that doesn't have one yet, spread evenly. Contacts
								with an established thread are never moved.
							</p>
						</div>
						<Button variant="outline" onClick={runBackfill} disabled={backfill.isPending}>
							{backfill.isPending ? "Assigning…" : "Backfill unassigned contacts"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
