"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { OwnerNumbersSettings } from "./OwnerNumbersSettings";

interface SpintaxRow {
	id: string;
	/** The variable name — the token is `${SPINTAX_<name>}`. */
	name: string;
	/** Comma-separated variations. */
	optionsRaw: string;
}

/** Normalise a typed name into a valid token suffix (upper snake, no edge `_`). */
function normalizeName(input: string): string {
	return input
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

/** Live-friendly normalisation: keep a trailing `_` the user is mid-typing. */
function normalizeWhileTyping(input: string): string {
	return input.toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
}

export function SubaccountSettings({ subaccountId }: { subaccountId?: string }) {
	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const [rows, setRows] = useState<SpintaxRow[]>([]);

	// Seed the editor from saved settings; keys are `SPINTAX_<NAME>`.
	useEffect(() => {
		const loaded = settingsQuery.data?.globalSpintax as Record<string, string[]> | undefined;
		if (!loaded) {
			return;
		}
		const seeded = Object.entries(loaded).map(([key, options]) => ({
			id: crypto.randomUUID(),
			name: key.replace(/^SPINTAX_/, ""),
			optionsRaw: options.join(", "),
		}));
		setRows(seeded.length > 0 ? seeded : [{ id: crypto.randomUUID(), name: "", optionsRaw: "" }]);
	}, [settingsQuery.data]);

	const save = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => toastSuccess("Settings saved"),
			onError: (error) => toastError(error.message ?? "Could not save settings"),
		}),
	);

	function updateRow(id: string, patch: Partial<SpintaxRow>) {
		setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
	}

	function addRow() {
		setRows((prev) => [...prev, { id: crypto.randomUUID(), name: "", optionsRaw: "" }]);
	}

	function removeRow(id: string) {
		setRows((prev) => prev.filter((row) => row.id !== id));
	}

	function onSave() {
		const globalSpintax: Record<string, string[]> = {};
		for (const row of rows) {
			const name = normalizeName(row.name);
			const options = row.optionsRaw
				.split(",")
				.map((option) => option.trim())
				.filter(Boolean);
			if (name.length > 0 && options.length > 0) {
				globalSpintax[`SPINTAX_${name}`] = options;
			}
		}
		save.mutate({ globalSpintax, subaccountId });
	}

	if (settingsQuery.isLoading) {
		return (
			<div className="py-16 flex justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	return (
		<div className="max-w-2xl gap-4 flex flex-col">
			<Card className="gap-4 p-5 flex flex-col">
				<div>
					<h3 className="font-medium">Global spintax variables</h3>
					<p className="text-sm text-foreground/75">
						Reusable variations for this subaccount. Name each one, then reference it in messages as{" "}
						<code className="rounded px-1 text-xs bg-muted">${"{SPINTAX_NAME}"}</code>. Separate
						variations with commas.
					</p>
				</div>

				<div className="gap-3 flex flex-col">
					{rows.map((row) => {
						const token = `\${SPINTAX_${normalizeName(row.name) || "…"}}`;
						return (
							<div key={row.id} className="gap-2 flex items-start">
								<div className="w-40 gap-1.5 flex shrink-0 flex-col">
									<Label className="text-xs">Name</Label>
									<Input
										placeholder="GREETING"
										className="font-mono"
										value={row.name}
										onChange={(e) =>
											updateRow(row.id, { name: normalizeWhileTyping(e.target.value) })
										}
									/>
								</div>
								<div className="min-w-0 gap-1.5 flex flex-1 flex-col">
									<Label className="text-xs">Variations</Label>
									<Input
										placeholder="Hi, Hello, Hey there"
										value={row.optionsRaw}
										onChange={(e) => updateRow(row.id, { optionsRaw: e.target.value })}
									/>
									<p className="text-[11px] text-foreground/55">
										Insert as <code className="text-foreground/70">{token}</code>
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="mt-5 size-9 shrink-0 text-foreground/75"
									aria-label="Remove variable"
									onClick={() => removeRow(row.id)}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						);
					})}

					{rows.length === 0 && (
						<p className="py-4 text-sm rounded-lg border-2 border-dashed text-center text-foreground/60">
							No variables yet.
						</p>
					)}
				</div>

				<div className="flex items-center justify-between">
					<Button type="button" variant="outline" size="sm" onClick={addRow}>
						<PlusIcon className="mr-1.5 size-3.5" />
						Add spintax
					</Button>
					<Button onClick={onSave} loading={save.isPending}>
						Save settings
					</Button>
				</div>
			</Card>

			<OwnerNumbersSettings subaccountId={subaccountId} />
		</div>
	);
}
