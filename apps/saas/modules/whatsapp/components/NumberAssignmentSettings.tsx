"use client";

import { Button } from "@repo/ui/components/button";
import { Switch } from "@repo/ui/components/switch";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Choose how a NEW contact's sticky sending number is picked when the owner initiates first, and
 * (in distributed mode) evenly assign numbers to contacts that don't have one yet.
 */
export function NumberAssignmentSettings({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const distributed = settingsQuery.data?.numberAssignmentStrategy === "distributed";

	const updateStrategy = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getSettings.key() });
			},
			onError: (error) => toastError(error.message ?? "Could not update assignment"),
		}),
	);

	const backfill = useMutation(
		orpc.whatsapp.backfillNumberAssignments.mutationOptions({
			onError: (error) => toastError(error.message ?? "Backfill failed"),
		}),
	);

	function setDistributed(next: boolean) {
		updateStrategy.mutate(
			{ numberAssignmentStrategy: next ? "distributed" : "owner", subaccountId },
			{ onSuccess: () => toastSuccess(next ? "Evenly distributing new contacts" : "Using owner number") },
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
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<p className="font-medium text-sm">Evenly distribute new contacts</p>
					<p className="text-muted-foreground text-sm">
						When you start a new conversation, assign the least-loaded number instead of your default —
						so contacts spread evenly across your numbers. Contacts who message you first (and everyone
						already assigned) keep their number.
					</p>
				</div>
				<Switch
					checked={distributed}
					onCheckedChange={setDistributed}
					disabled={settingsQuery.isLoading || updateStrategy.isPending}
				/>
			</div>

			<div className="space-y-3 border-t pt-4">
				<div className="space-y-1">
					<p className="font-medium text-sm">Backfill existing contacts</p>
					<p className="text-muted-foreground text-sm">
						Assign a number to every contact that doesn't have one yet, spread evenly across your
						numbers. Contacts with an established thread are never moved.
					</p>
				</div>
				<Button variant="outline" onClick={runBackfill} disabled={backfill.isPending}>
					{backfill.isPending ? "Assigning…" : "Backfill unassigned contacts"}
				</Button>
			</div>
		</div>
	);
}
