"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, PlusIcon, UserIcon, XIcon } from "lucide-react";
import { useState } from "react";

const UNASSIGNED = "__unassigned__";

interface ContactDetailsPanelProps {
	chatId: string;
	subaccountId?: string;
	onClose: () => void;
}

export function ContactDetailsPanel({ chatId, subaccountId, onClose }: ContactDetailsPanelProps) {
	const queryClient = useQueryClient();
	const [tagInput, setTagInput] = useState("");
	const [addingTag, setAddingTag] = useState(false);

	const profileQuery = useQuery({
		...orpc.whatsapp.getContactProfile.queryOptions({ input: { chatId, subaccountId } }),
		// Keep an open panel tracking CRM-side edits (the procedure reads through
		// to the live GHL contact).
		refetchInterval: 8000,
	});
	const ownersQuery = useQuery(
		orpc.whatsapp.listContactOwners.queryOptions({ input: { subaccountId } }),
	);

	function invalidateProfile() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getContactProfile.key() });
	}

	const setOwner = useMutation(
		orpc.whatsapp.setContactOwner.mutationOptions({ onSuccess: invalidateProfile }),
	);
	const setTags = useMutation(
		orpc.whatsapp.setContactTags.mutationOptions({ onSuccess: invalidateProfile }),
	);
	const setFields = useMutation(
		orpc.whatsapp.setContactFields.mutationOptions({ onSuccess: invalidateProfile }),
	);

	const [editingField, setEditingField] = useState<{ key: string; value: string } | null>(null);

	function saveField() {
		if (!editingField) {
			return;
		}
		const { key, value } = editingField;
		setEditingField(null);
		if (key === "firstName" || key === "lastName" || key === "email") {
			setFields.mutate({ chatId, subaccountId, [key]: value.trim() });
		}
	}

	const profile = profileQuery.data;
	const owners = ownersQuery.data ?? [];

	function addTag() {
		const tag = tagInput.trim();
		if (tag) {
			setTags.mutate({ chatId, tag, action: "add", subaccountId });
		}
		setTagInput("");
		setAddingTag(false);
	}

	return (
		<div className="flex h-full flex-col bg-card">
			<div className="px-3 py-2.5 flex items-center justify-between border-b">
				<p className="font-medium text-sm">Contact Details</p>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-foreground/60"
					aria-label="Close contact details"
					onClick={onClose}
				>
					<XIcon className="size-4" />
				</Button>
			</div>

			{profileQuery.isLoading || !profile ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : (
				<div className="gap-4 p-3 flex flex-1 flex-col overflow-y-auto">
					{/* Identity card */}
					<div className="gap-3 p-3 flex items-center rounded-lg border bg-background">
						<Avatar className="size-10">
							{profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt="" /> : null}
							<AvatarFallback className="text-xs bg-primary/10 text-primary">
								{profile.initials}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<p className="font-semibold text-sm truncate">{profile.name}</p>
							{profile.phone ? (
								<p className="text-xs truncate text-foreground/50">{profile.phone}</p>
							) : null}
						</div>
						{profile.ghl.contactUrl ? (
							<a
								href={profile.ghl.contactUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Open in GoHighLevel"
								className="text-foreground/50 hover:text-foreground"
							>
								<ExternalLinkIcon className="size-4" />
							</a>
						) : null}
					</div>

					{/* Owner */}
					<div className="gap-1.5 flex flex-col">
						<span className="font-medium text-xs text-foreground/60">Owner</span>
						<Select
							value={profile.ownerId ?? UNASSIGNED}
							disabled={setOwner.isPending}
							onValueChange={(value) =>
								setOwner.mutate({
									chatId,
									ownerId: value === UNASSIGNED ? null : value,
									subaccountId,
								})
							}
						>
							<SelectTrigger className="h-9">
								<div className="gap-2 flex items-center">
									<UserIcon className="size-3.5 text-foreground/50" />
									<SelectValue placeholder="Unassigned" />
								</div>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
								{owners.map((owner) => (
									<SelectItem key={owner.id} value={owner.id}>
										{owner.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{!profile.ownerId && profile.ghl.assignee && !profile.ghl.assignee.memberId ? (
							<p className="leading-snug text-[11px] text-foreground/50">
								Assigned in GoHighLevel to{" "}
								<span className="text-foreground/70">
									{profile.ghl.assignee.name || profile.ghl.assignee.email || "a GHL user"}
								</span>{" "}
								— invite them as an agency member to sync ownership.
							</p>
						) : null}
					</div>

					{/* Tags */}
					<div className="gap-1.5 flex flex-col">
						<span className="font-medium text-xs text-foreground/60">
							Tags ({profile.tags.length})
						</span>
						<div className="gap-1.5 flex flex-wrap items-center">
							{profile.tags.map((tag) => (
								<Badge key={tag} className="gap-1 pr-1 font-normal">
									{tag}
									<button
										type="button"
										aria-label={`Remove ${tag}`}
										className="p-0.5 rounded-full hover:bg-foreground/10"
										onClick={() => setTags.mutate({ chatId, tag, action: "remove", subaccountId })}
									>
										<XIcon className="size-3" />
									</button>
								</Badge>
							))}
							{addingTag ? (
								<Input
									// oxlint-disable-next-line no-autofocus
									autoFocus
									value={tagInput}
									placeholder="Tag name"
									className="h-7 w-28 text-xs"
									onChange={(event) => setTagInput(event.target.value)}
									onBlur={addTag}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											addTag();
										} else if (event.key === "Escape") {
											setTagInput("");
											setAddingTag(false);
										}
									}}
								/>
							) : (
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="size-6 rounded-full"
									aria-label="Add tag"
									onClick={() => setAddingTag(true)}
								>
									<PlusIcon className="size-3.5" />
								</Button>
							)}
						</div>
					</div>

					{/* Fields */}
					<div className="gap-2 p-3 flex flex-col rounded-lg border bg-background">
						<span className="font-medium text-xs text-foreground/60">Contact</span>
						{profile.fields.map((field) => (
							<div key={field.key} className="gap-0.5 flex flex-col">
								<span className="text-[11px] text-foreground/50">{field.label}</span>
								{editingField?.key === field.key ? (
									<Input
										// oxlint-disable-next-line no-autofocus
										autoFocus
										value={editingField.value}
										className="h-7 text-sm"
										onChange={(event) =>
											setEditingField({ key: field.key, value: event.target.value })
										}
										onBlur={saveField}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												saveField();
											} else if (event.key === "Escape") {
												setEditingField(null);
											}
										}}
									/>
								) : field.editable ? (
									<button
										type="button"
										className="text-sm -mx-1 rounded px-1 text-left hover:bg-foreground/5"
										title={`Edit ${field.label.toLowerCase()}`}
										onClick={() => setEditingField({ key: field.key, value: field.value ?? "" })}
									>
										{field.value || <span className="text-foreground/40">—</span>}
									</button>
								) : (
									<span className="text-sm">{field.value || "—"}</span>
								)}
							</div>
						))}
					</div>

					{/* GHL status */}
					<div className="p-3 text-xs mt-auto rounded-lg border border-dashed">
						{profile.ghl.connected ? (
							<p className="text-foreground/60">
								Synced with GoHighLevel. Owner and tag changes will propagate to the contact.
							</p>
						) : (
							<p className="text-foreground/60">
								<span className="font-medium text-foreground">GoHighLevel not connected.</span>{" "}
								Owner and tags are saved here and will sync to the contact once you connect GHL.
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
