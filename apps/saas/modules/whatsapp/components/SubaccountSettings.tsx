"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const SPINTAX_KEYS = ["SPINTAX_1", "SPINTAX_2", "SPINTAX_3", "SPINTAX_4", "SPINTAX_5", "SPINTAX_6"];

export function SubaccountSettings({ subaccountId }: { subaccountId?: string }) {
	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const [spintax, setSpintax] = useState<Record<string, string>>({});

	// Seed the local editor from the loaded settings once.
	useEffect(() => {
		const loaded = settingsQuery.data?.globalSpintax as Record<string, string[]> | undefined;
		if (loaded) {
			const seeded: Record<string, string> = {};
			for (const key of SPINTAX_KEYS) {
				seeded[key] = (loaded[key] ?? []).join(", ");
			}
			setSpintax(seeded);
		}
	}, [settingsQuery.data]);

	const save = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => toastSuccess("Settings saved"),
			onError: (error) => toastError(error.message ?? "Could not save settings"),
		}),
	);

	function onSave() {
		const globalSpintax: Record<string, string[]> = {};
		for (const key of SPINTAX_KEYS) {
			const options = (spintax[key] ?? "")
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean);
			if (options.length > 0) {
				globalSpintax[key] = options;
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
						Reusable variations for this subaccount. Reference them in messages as{" "}
						<code className="rounded px-1 text-xs bg-muted">${"{SPINTAX_1}"}</code>.
						Comma-separated.
					</p>
				</div>
				<div className="gap-3 flex flex-col">
					{SPINTAX_KEYS.map((key) => (
						<div key={key} className="gap-1.5 flex flex-col">
							<Label htmlFor={key} className="text-xs">
								{key}
							</Label>
							<Input
								id={key}
								placeholder="Hi, Hello, Hey there"
								value={spintax[key] ?? ""}
								onChange={(e) => setSpintax((prev) => ({ ...prev, [key]: e.target.value }))}
							/>
						</div>
					))}
				</div>
				<div className="flex justify-end">
					<Button onClick={onSave} loading={save.isPending}>
						Save settings
					</Button>
				</div>
			</Card>
		</div>
	);
}
