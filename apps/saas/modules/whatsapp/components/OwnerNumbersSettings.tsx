"use client";

import { Card } from "@repo/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserIcon } from "lucide-react";

const UNASSIGNED = "__unassigned__";

export function OwnerNumbersSettings({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();

	// Same people as the contact-owner dropdown on the inbox aside (GHL staff
	// when connected, else agency members) — one source of truth.
	const ownersQuery = useQuery(
		orpc.whatsapp.listOwnerNumbers.queryOptions({ input: { subaccountId } }),
	);
	const numbersQuery = useQuery(
		orpc.whatsapp.listNumbers.queryOptions({ input: { subaccountId } }),
	);

	const invalidate = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listOwnerNumbers.key() });

	const setNumber = useMutation(
		orpc.whatsapp.setOwnerNumber.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toastError(error.message ?? "Could not update the default number"),
		}),
	);

	const owners = ownersQuery.data ?? [];
	const numbers = numbersQuery.data ?? [];

	return (
		<Card className="gap-4 p-5 flex flex-col">
			<div>
				<h3 className="font-medium">Default number per user</h3>
				<p className="text-sm text-foreground/75">
					Choose which WhatsApp number each user sends from by default in this subaccount — the same
					people you can assign as a contact owner. Their first outreach to a new contact locks that
					contact to this number; they can still switch per conversation from the inbox.
				</p>
			</div>

			{ownersQuery.isLoading ? (
				<div className="py-8 flex justify-center">
					<Spinner className="size-5" />
				</div>
			) : owners.length === 0 ? (
				<p className="py-4 text-sm rounded-lg border-2 border-dashed text-center text-foreground/60">
					No users yet.
				</p>
			) : (
				<div className="gap-3 flex flex-col">
					{owners.map((owner) => (
						<div
							key={owner.ownerId}
							className="gap-3 sm:flex-row sm:items-center flex flex-col justify-between"
						>
							<div className="min-w-0 gap-2 flex items-center">
								<div className="size-8 flex shrink-0 items-center justify-center rounded-full bg-primary/10">
									<UserIcon className="size-4 text-primary" />
								</div>
								<div className="min-w-0">
									<p className="text-sm truncate">{owner.name}</p>
									{owner.email ? (
										<p className="text-xs truncate text-foreground/60">{owner.email}</p>
									) : null}
								</div>
							</div>
							<Select
								value={owner.sessionId ?? UNASSIGNED}
								disabled={setNumber.isPending}
								onValueChange={(value) =>
									setNumber.mutate({
										ownerId: owner.ownerId,
										sessionId: value === UNASSIGNED ? null : value,
										subaccountId,
									})
								}
							>
								<SelectTrigger className="sm:w-56 w-full">
									<SelectValue placeholder="No default" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED}>No default</SelectItem>
									{numbers.map((number) => (
										<SelectItem key={number.id} value={number.id}>
											{number.label || number.phone || "Unnamed number"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>
			)}
		</Card>
	);
}
