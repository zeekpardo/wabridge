"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** No-WhatsApp tag editor — sets the CRM tag applied when a contact's number isn't on WhatsApp. */
export function NoWhatsappTagEditor({ subaccountId }: { subaccountId?: string }) {
	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const [tag, setTag] = useState("");

	useEffect(() => {
		if (settingsQuery.data) {
			setTag(settingsQuery.data.noWhatsappTag ?? "");
		}
	}, [settingsQuery.data]);

	const save = useMutation(
		orpc.whatsapp.updateSettings.mutationOptions({
			onSuccess: () => toastSuccess("Settings saved"),
			onError: (error) => toastError(error.message ?? "Could not save settings"),
		}),
	);

	function onSave() {
		save.mutate({ noWhatsappTag: tag.trim(), subaccountId });
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
				Tag applied to a contact in your CRM when you send them a message and their number isn't on
				WhatsApp. Leave empty to disable.
			</p>

			<div className="gap-1.5 flex flex-col">
				<Label className="text-xs">Tag</Label>
				<Input placeholder="no-whatsapp" value={tag} onChange={(e) => setTag(e.target.value)} />
			</div>

			<div className="flex items-center justify-end">
				<Button onClick={onSave} loading={save.isPending}>
					Save settings
				</Button>
			</div>
		</div>
	);
}
