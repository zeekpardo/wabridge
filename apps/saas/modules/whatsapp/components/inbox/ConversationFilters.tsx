"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ListFilterIcon, XIcon } from "lucide-react";
import { useState } from "react";

export interface TagFilter {
	tag: string;
	mode: "has" | "not";
}

interface ConversationFiltersProps {
	subaccountId?: string;
	ownerFilter: string | null;
	onOwnerChange: (ownerId: string | null) => void;
	tagFilter: TagFilter | null;
	onTagChange: (filter: TagFilter | null) => void;
}

/**
 * Owner + tag filters for the conversation list. Owner options come from GHL
 * staff (or agency members standalone); tag options from the location's tag
 * library. Filters apply to each thread's cached owner/tags, so they cover
 * synced contacts — a fresh sync/backfill widens coverage.
 */
export function ConversationFilters({
	subaccountId,
	ownerFilter,
	onOwnerChange,
	tagFilter,
	onTagChange,
}: ConversationFiltersProps) {
	const [open, setOpen] = useState(false);

	const ownersQuery = useQuery({
		...orpc.whatsapp.listContactOwners.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});
	const tagsQuery = useQuery({
		...orpc.whatsapp.listContactTags.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});

	const owners = ownersQuery.data ?? [];
	const tags = tagsQuery.data ?? [];
	const activeCount = (ownerFilter ? 1 : 0) + (tagFilter ? 1 : 0);
	const ownerName = ownerFilter
		? (owners.find((o) => o.id === ownerFilter)?.name ?? "Owner")
		: null;

	return (
		<div className="gap-1.5 px-2 py-1.5 flex flex-wrap items-center border-b">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant="outline" size="sm" className="gap-1.5 h-7">
						<ListFilterIcon className="size-3.5" />
						Filter
						{activeCount > 0 ? (
							<Badge className="size-4 p-0 justify-center text-[10px]">{activeCount}</Badge>
						) : null}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="p-1.5 w-64">
					{/* Owner */}
					<p className="px-1.5 pb-1 text-[11px] text-foreground/50">Owner</p>
					<div className="max-h-40 overflow-y-auto">
						<FilterRow
							selected={!ownerFilter}
							label="Any owner"
							onClick={() => onOwnerChange(null)}
						/>
						{owners.map((owner) => (
							<FilterRow
								key={owner.id}
								selected={ownerFilter === owner.id}
								label={owner.name}
								onClick={() => onOwnerChange(ownerFilter === owner.id ? null : owner.id)}
							/>
						))}
						{ownersQuery.isLoading ? (
							<p className="px-2 py-1.5 text-xs text-foreground/40">Loading…</p>
						) : null}
					</div>

					<div className="my-1 border-t" />

					{/* Tag + has/not */}
					<div className="px-1.5 pb-1 flex items-center justify-between">
						<span className="text-[11px] text-foreground/50">Tag</span>
						{tagFilter ? (
							<button
								type="button"
								className="gap-1 rounded px-1 flex items-center text-[11px] text-foreground/60 hover:bg-foreground/5"
								onClick={() =>
									onTagChange({
										tag: tagFilter.tag,
										mode: tagFilter.mode === "has" ? "not" : "has",
									})
								}
							>
								{tagFilter.mode === "has" ? "has" : "does not have"}
							</button>
						) : null}
					</div>
					<div className="max-h-40 overflow-y-auto">
						{tags.map((tag) => {
							const selected = tagFilter?.tag === tag;
							return (
								<FilterRow
									key={tag}
									selected={selected}
									label={tag}
									onClick={() =>
										onTagChange(selected ? null : { tag, mode: tagFilter?.mode ?? "has" })
									}
								/>
							);
						})}
						{tagsQuery.isLoading ? (
							<p className="px-2 py-1.5 text-xs text-foreground/40">Loading…</p>
						) : null}
						{!tagsQuery.isLoading && tags.length === 0 ? (
							<p className="px-2 py-1.5 text-xs text-foreground/40">No tags</p>
						) : null}
					</div>

					{activeCount > 0 ? (
						<>
							<div className="my-1 border-t" />
							<button
								type="button"
								className="px-2 py-1.5 text-sm rounded w-full text-left text-foreground/70 hover:bg-foreground/5"
								onClick={() => {
									onOwnerChange(null);
									onTagChange(null);
								}}
							>
								Clear filters
							</button>
						</>
					) : null}
				</PopoverContent>
			</Popover>

			{ownerName ? <FilterChip label={ownerName} onClear={() => onOwnerChange(null)} /> : null}
			{tagFilter ? (
				<FilterChip
					label={`${tagFilter.mode === "has" ? "" : "not "}#${tagFilter.tag}`}
					onClear={() => onTagChange(null)}
				/>
			) : null}
		</div>
	);
}

function FilterRow({
	selected,
	label,
	onClick,
}: {
	selected: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="gap-2 px-2 py-1.5 text-sm rounded flex w-full items-center text-left hover:bg-foreground/5"
			onClick={onClick}
		>
			<span
				className={`size-3.5 flex shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
			>
				{selected ? <CheckIcon className="size-2.5" /> : null}
			</span>
			<span className="truncate">{label}</span>
		</button>
	);
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
	return (
		<Badge status="info" className="gap-1 pr-1 font-normal">
			<span className="max-w-28 truncate">{label}</span>
			<button
				type="button"
				aria-label={`Clear ${label} filter`}
				className="p-0.5 rounded-full hover:bg-foreground/10"
				onClick={onClear}
			>
				<XIcon className="size-3" />
			</button>
		</Badge>
	);
}
