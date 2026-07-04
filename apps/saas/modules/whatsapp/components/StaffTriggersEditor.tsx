"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

interface TriggerRow {
	id: string;
	phrase: string;
	tag: string;
}

/** Staff triggers editor — auto-tag a contact when an outgoing message contains a phrase. */
export function StaffTriggersEditor({ subaccountId }: { subaccountId?: string }) {
	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const [rows, setRows] = useState<TriggerRow[]>([]);

	useEffect(() => {
		const loaded = settingsQuery.data?.staffTriggers;
		if (!loaded) {
			return;
		}
		const seeded = loaded.map((trigger) => ({
			id: crypto.randomUUID(),
			phrase: trigger.phrase,
			tag: trigger.tag,
		}));
		setRows(seeded.length > 0 ? seeded : [{ id: crypto.randomUUID(), phrase: "", tag: "" }]);
	}, [settingsQuery.data]);

	const save = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => toastSuccess("Settings saved"),
			onError: (error) => toastError(error.message ?? "Could not save settings"),
		}),
	);

	function updateRow(id: string, patch: Partial<TriggerRow>) {
		setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
	}

	function addRow() {
		setRows((prev) => [...prev, { id: crypto.randomUUID(), phrase: "", tag: "" }]);
	}

	function removeRow(id: string) {
		setRows((prev) => prev.filter((row) => row.id !== id));
	}

	function onSave() {
		const staffTriggers = rows
			.filter((row) => row.phrase.trim() && row.tag.trim())
			.map((row) => ({ phrase: row.phrase.trim(), tag: row.tag.trim() }));
		save.mutate({ staffTriggers, subaccountId });
	}

	if (settingsQuery.isLoading) {
		return (
			<div className="py-10 flex justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	return (
		<div className="gap-4 flex flex-col">
			<p className="text-sm text-foreground/75">
				When an outgoing message contains the phrase (case-sensitive), the tag is added to the
				contact in your CRM.
			</p>

			<div className="gap-3 flex flex-col">
				{rows.map((row) => (
					<div key={row.id} className="gap-2 flex items-start">
						<div className="min-w-0 gap-1.5 flex flex-1 flex-col">
							<Label className="text-xs">Phrase</Label>
							<Input
								placeholder="Thanks for chatting with our team"
								value={row.phrase}
								onChange={(e) => updateRow(row.id, { phrase: e.target.value })}
							/>
						</div>
						<div className="min-w-0 gap-1.5 flex flex-1 flex-col">
							<Label className="text-xs">Tag</Label>
							<Input
								placeholder="staff-reply"
								value={row.tag}
								onChange={(e) => updateRow(row.id, { tag: e.target.value })}
							/>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="mt-5 size-9 shrink-0 text-foreground/75"
							aria-label="Remove trigger"
							onClick={() => removeRow(row.id)}
						>
							<Trash2Icon className="size-4" />
						</Button>
					</div>
				))}

				{rows.length === 0 && (
					<p className="py-4 text-sm rounded-lg border-2 border-dashed text-center text-foreground/60">
						No triggers yet.
					</p>
				)}
			</div>

			<div className="flex items-center justify-between">
				<Button type="button" variant="outline" size="sm" onClick={addRow}>
					<PlusIcon className="mr-1.5 size-3.5" />
					Add trigger
				</Button>
				<Button onClick={onSave} loading={save.isPending}>
					Save settings
				</Button>
			</div>
		</div>
	);
}
