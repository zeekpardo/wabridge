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

export function MemberNumbersSettings({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();

	const membersQuery = useQuery(
		orpc.whatsapp.listMemberNumbers.queryOptions({ input: { subaccountId } }),
	);
	const numbersQuery = useQuery(
		orpc.whatsapp.listNumbers.queryOptions({ input: { subaccountId } }),
	);

	const invalidate = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listMemberNumbers.key() });

	const setNumber = useMutation(
		orpc.whatsapp.setMemberNumber.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toastError(error.message ?? "Could not update the default number"),
		}),
	);

	const members = membersQuery.data ?? [];
	const numbers = numbersQuery.data ?? [];

	return (
		<Card className="gap-4 p-5 flex flex-col">
			<div>
				<h3 className="font-medium">Member default numbers</h3>
				<p className="text-sm text-foreground/75">
					Choose which WhatsApp number each agency member sends from by default in this subaccount.
					They can still switch per conversation from the inbox.
				</p>
			</div>

			{membersQuery.isLoading ? (
				<div className="py-8 flex justify-center">
					<Spinner className="size-5" />
				</div>
			) : members.length === 0 ? (
				<p className="py-4 text-sm rounded-lg border-2 border-dashed text-center text-foreground/60">
					No members yet.
				</p>
			) : (
				<div className="gap-3 flex flex-col">
					{members.map((member) => (
						<div
							key={member.memberId}
							className="gap-3 sm:flex-row sm:items-center flex flex-col justify-between"
						>
							<div className="min-w-0 gap-2 flex items-center">
								<div className="size-8 flex shrink-0 items-center justify-center rounded-full bg-primary/10">
									<UserIcon className="size-4 text-primary" />
								</div>
								<p className="text-sm truncate">{member.name}</p>
							</div>
							<Select
								value={member.sessionId ?? UNASSIGNED}
								disabled={setNumber.isPending}
								onValueChange={(value) =>
									setNumber.mutate({
										memberId: member.memberId,
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
