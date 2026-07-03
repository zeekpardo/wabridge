"use client";

import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Card } from "@repo/ui/components/card";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CreateGroupDialog } from "./CreateGroupDialog";
import { GroupDetail } from "./GroupDetail";

interface GroupsViewProps {
	subaccountId?: string;
	embedded?: boolean;
	/** A group id (chatId) to open on mount — from the inbox "Manage" shortcut. */
	initialGroupId?: string | null;
	/** Called once the initial group has been applied, so the parent can clear it. */
	onInitialGroupConsumed?: () => void;
}

export function GroupsView({
	subaccountId,
	embedded = false,
	initialGroupId,
	onInitialGroupConsumed,
}: GroupsViewProps) {
	// The selected group as { sessionId, groupId, isAdmin } — a group is tied to a
	// single number, so we carry both to address the gateway, plus the list's
	// isAdmin flag (the only place we learn whether our number can write).
	const [selected, setSelected] = useState<{
		sessionId: string;
		groupId: string;
		isAdmin: boolean;
	} | null>(null);

	const groupsQuery = useQuery({
		...orpc.whatsapp.listGroups.queryOptions({ input: { subaccountId } }),
		refetchInterval: 30000,
	});

	// Memoize so the reference is stable across renders — the effect and the
	// grouping below both depend on it.
	const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

	// Apply the Manage shortcut once the group is present in the list (we need its
	// sessionId, which only the list carries).
	useEffect(() => {
		if (!initialGroupId || groups.length === 0) {
			return;
		}
		const match = groups.find((g) => g.id === initialGroupId);
		if (match) {
			setSelected({
				sessionId: match.sessionId,
				groupId: match.id,
				isAdmin: match.isAdmin ?? false,
			});
			onInitialGroupConsumed?.();
		}
	}, [initialGroupId, groups, onInitialGroupConsumed]);

	// Group the flat list by number label, so several connected numbers each get
	// their own labelled section.
	const sections = useMemo(() => {
		const byLabel = new Map<string, typeof groups>();
		for (const group of groups) {
			const label = group.numberLabel ?? "Unlabelled number";
			const existing = byLabel.get(label);
			if (existing) {
				existing.push(group);
			} else {
				byLabel.set(label, [group]);
			}
		}
		return [...byLabel.entries()].map(([label, items]) => ({ label, items }));
	}, [groups]);

	return (
		<Card
			className={cn(
				"p-0 relative flex overflow-hidden",
				embedded
					? "h-full rounded-none border-0 shadow-none"
					: "h-[calc(100vh-16rem)] min-h-[32rem]",
			)}
		>
			<div
				className={cn(
					"md:w-1/3 md:min-w-64 flex w-full shrink-0 flex-col border-r",
					selected ? "md:flex hidden" : "flex",
				)}
			>
				<div className="gap-2 p-3 flex items-center justify-between border-b">
					<p className="font-medium text-sm">Groups</p>
					<CreateGroupDialog
						subaccountId={subaccountId}
						onCreated={(created) => {
							void groupsQuery.refetch();
							// The creator is the group owner, so it's always an admin.
							setSelected({
								sessionId: created.sessionId,
								groupId: created.groupId,
								isAdmin: true,
							});
						}}
					/>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto">
					{groupsQuery.isLoading ? (
						<div className="py-10 flex justify-center">
							<Spinner className="size-5" />
						</div>
					) : groups.length === 0 ? (
						<div className="gap-2 p-6 flex flex-col items-center justify-center text-center">
							<div className="size-10 flex items-center justify-center rounded-full bg-primary/10">
								<UsersIcon className="size-5 text-primary" />
							</div>
							<p className="font-medium text-sm">No groups yet</p>
							<p className="text-xs text-foreground/70">
								Create a group, or one will appear here once a connected number joins it.
							</p>
						</div>
					) : (
						sections.map((section) => (
							<div key={section.label}>
								<p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-foreground/55 uppercase">
									{section.label}
								</p>
								{section.items.map((group) => {
									const isSelected =
										selected?.groupId === group.id && selected?.sessionId === group.sessionId;
									return (
										<button
											key={group.id}
											type="button"
											className={cn(
												"gap-2.5 px-3 py-2 flex w-full items-center text-left hover:bg-foreground/5",
												isSelected && "bg-foreground/5",
											)}
											onClick={() =>
												setSelected({
													sessionId: group.sessionId,
													groupId: group.id,
													isAdmin: group.isAdmin ?? false,
												})
											}
										>
											<div className="size-9 flex shrink-0 items-center justify-center rounded-full bg-muted">
												<UsersIcon className="size-4 text-foreground/60" />
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-sm truncate">{group.name || "Unnamed group"}</p>
												<p className="text-xs truncate text-foreground/60">
													{group.participantsCount != null
														? `${group.participantsCount} member${group.participantsCount === 1 ? "" : "s"}`
														: "Group"}
												</p>
											</div>
											{group.isAdmin ? (
												<Badge status="info" className="px-2 py-0.5 shrink-0 normal-case">
													Admin
												</Badge>
											) : null}
										</button>
									);
								})}
							</div>
						))
					)}
				</div>
			</div>

			<div className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "md:flex hidden")}>
				{selected ? (
					<GroupDetail
						subaccountId={subaccountId}
						sessionId={selected.sessionId}
						groupId={selected.groupId}
						isAdmin={selected.isAdmin}
						onBack={() => setSelected(null)}
						onLeft={() => {
							setSelected(null);
							void groupsQuery.refetch();
						}}
					/>
				) : (
					<div className="gap-2 flex flex-1 flex-col items-center justify-center text-center">
						<div className="size-12 flex items-center justify-center rounded-full bg-primary/10">
							<UsersIcon className="size-6 text-primary" />
						</div>
						<p className="font-medium">Select a group</p>
						<p className="text-sm text-foreground/75">
							Pick a group on the left to manage its members and settings.
						</p>
					</div>
				)}
			</div>
		</Card>
	);
}
