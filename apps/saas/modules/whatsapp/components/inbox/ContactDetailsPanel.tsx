"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
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
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
	PlusIcon,
	SearchIcon,
	SlidersHorizontalIcon,
	UserIcon,
	XIcon,
} from "lucide-react";
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
	const [tagPickerOpen, setTagPickerOpen] = useState(false);

	const profileQuery = useQuery({
		...orpc.whatsapp.getContactProfile.queryOptions({ input: { chatId, subaccountId } }),
		// Keep an open panel tracking CRM-side edits (the procedure reads through
		// to the live GHL contact).
		refetchInterval: 8000,
	});
	const ownersQuery = useQuery(
		orpc.whatsapp.listContactOwners.queryOptions({ input: { subaccountId } }),
	);
	const tagOptionsQuery = useQuery({
		...orpc.whatsapp.listContactTags.queryOptions({ input: { subaccountId } }),
		enabled: tagPickerOpen,
	});
	const customFieldsQuery = useQuery({
		...orpc.whatsapp.getCustomFieldGroups.queryOptions({ input: { chatId, subaccountId } }),
		refetchInterval: 15000,
	});

	// Which folders show, and which are collapsed — persisted per subaccount so
	// a curated layout sticks across contacts and sessions (display-only, so
	// localStorage is enough).
	const hiddenKey = `wabridge:cf-hidden:${subaccountId ?? "default"}`;
	const hideEmptyKey = `wabridge:cf-hide-empty:${subaccountId ?? "default"}`;
	const [hiddenFolders, setHiddenFolders] = useState<Set<string>>(() => readIdSet(hiddenKey));
	const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
	const [hideEmptyFields, setHideEmptyFields] = useState<boolean>(() => readFlag(hideEmptyKey));
	const [folderSettingsOpen, setFolderSettingsOpen] = useState(false);

	function toggleHideEmpty() {
		setHideEmptyFields((prev) => {
			const next = !prev;
			writeFlag(hideEmptyKey, next);
			return next;
		});
	}

	function toggleHiddenFolder(id: string) {
		setHiddenFolders((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			writeIdSet(hiddenKey, next);
			return next;
		});
	}

	function toggleCollapsedFolder(id: string) {
		setCollapsedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function invalidateProfile() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getContactProfile.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listContactTags.key() });
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
	const linkByPhone = useMutation(
		orpc.whatsapp.linkContactByPhone.mutationOptions({ onSuccess: invalidateProfile }),
	);
	const [linkPhone, setLinkPhone] = useState("");

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
	}

	return (
		<div className="flex h-full flex-col bg-card">
			<div className="px-3 py-2.5 flex items-center justify-between border-b">
				<p className="font-medium text-sm">Contact Details</p>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-foreground/75"
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
								<p className="text-xs truncate text-foreground/65">{profile.phone}</p>
							) : null}
						</div>
						{profile.ghl.contactUrl ? (
							<a
								href={profile.ghl.contactUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Open in GoHighLevel"
								className="text-foreground/65 hover:text-foreground"
							>
								<ExternalLinkIcon className="size-4" />
							</a>
						) : null}
					</div>

					{/* The contact's name as WhatsApp shows it (their self-set display
					    name), so a rep can reconcile it with the CRM name above. */}
					{profile.whatsappName ? (
						<div className="gap-0.5 flex flex-col">
							<span className="font-medium text-xs text-foreground/75">WhatsApp name</span>
							<span className="text-sm truncate">{profile.whatsappName}</span>
						</div>
					) : null}

					{/* Manual CRM link — for @lid (WhatsApp privacy) threads whose number
					    couldn't be auto-resolved to match a GoHighLevel contact. */}
					{profile.ghl.connected && profile.ghl.linkableByPhone ? (
						<div className="gap-1.5 p-3 flex flex-col rounded-lg border border-dashed">
							<span className="font-medium text-xs text-foreground/75">Link to GoHighLevel</span>
							<p className="leading-snug text-[11px] text-foreground/65">
								This chat hides its number (WhatsApp privacy), so it isn’t matched to a CRM contact
								yet. Enter the contact’s phone to link it.
							</p>
							<div className="gap-1.5 flex items-center">
								<Input
									value={linkPhone}
									placeholder="+1 555 123 4567"
									inputMode="tel"
									className="h-8 text-sm"
									onChange={(event) => setLinkPhone(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter" && linkPhone.trim().replace(/\D/g, "").length >= 6) {
											event.preventDefault();
											linkByPhone.mutate({ chatId, phone: linkPhone.trim(), subaccountId });
										}
									}}
								/>
								<Button
									size="sm"
									className="h-8"
									disabled={linkByPhone.isPending || linkPhone.trim().replace(/\D/g, "").length < 6}
									onClick={() =>
										linkByPhone.mutate({ chatId, phone: linkPhone.trim(), subaccountId })
									}
								>
									{linkByPhone.isPending ? <Spinner className="size-4" /> : "Link"}
								</Button>
							</div>
							{linkByPhone.data && !linkByPhone.data.linked ? (
								<p className="text-[11px] text-destructive">
									Couldn’t link — check the number and that GoHighLevel is reachable.
								</p>
							) : null}
						</div>
					) : null}

					{/* Owner */}
					<div className="gap-1.5 flex flex-col">
						<span className="font-medium text-xs text-foreground/75">Owner</span>
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
									<UserIcon className="size-3.5 text-foreground/65" />
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
							<p className="leading-snug text-[11px] text-foreground/65">
								Assigned in GoHighLevel to{" "}
								<span className="text-foreground/80">
									{profile.ghl.assignee.name || profile.ghl.assignee.email || "a GHL user"}
								</span>{" "}
								— invite them as an agency member to sync ownership.
							</p>
						) : null}
					</div>

					{/* Tags */}
					<div className="gap-1.5 flex flex-col">
						<span className="font-medium text-xs text-foreground/75">
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
							<Popover
								open={tagPickerOpen}
								onOpenChange={(open) => {
									setTagPickerOpen(open);
									if (!open) {
										setTagInput("");
									}
								}}
							>
								<PopoverTrigger asChild>
									<Button
										type="button"
										variant="outline"
										size="icon"
										className="size-6 rounded-full"
										aria-label="Add tag"
									>
										<PlusIcon className="size-3.5" />
									</Button>
								</PopoverTrigger>
								<PopoverContent align="start" className="p-1.5 w-64">
									<div className="gap-1.5 px-1.5 pb-1.5 flex items-center border-b">
										<SearchIcon className="size-3.5 shrink-0 text-foreground/55" />
										<input
											// oxlint-disable-next-line no-autofocus
											autoFocus
											value={tagInput}
											placeholder="Search tags"
											className="h-7 text-sm w-full bg-transparent outline-none placeholder:text-foreground/55"
											onChange={(event) => setTagInput(event.target.value)}
										/>
									</div>
									<div className="max-h-56 mt-1 overflow-y-auto">
										{tagOptionsQuery.isLoading ? (
											<div className="py-4 flex justify-center">
												<Spinner className="size-4" />
											</div>
										) : (
											(() => {
												const query = tagInput.trim().toLowerCase();
												const options = (tagOptionsQuery.data ?? []).filter(
													(tag) => !query || tag.toLowerCase().includes(query),
												);
												const active = new Set(profile.tags.map((tag) => tag.toLowerCase()));
												const exactMatch = (tagOptionsQuery.data ?? []).some(
													(tag) => tag.toLowerCase() === query,
												);
												return (
													<>
														{options.map((tag) => {
															const selected = active.has(tag.toLowerCase());
															return (
																<button
																	key={tag}
																	type="button"
																	className="gap-2 px-2 py-1.5 text-sm rounded flex w-full items-center text-left hover:bg-foreground/5"
																	disabled={setTags.isPending}
																	onClick={() =>
																		setTags.mutate({
																			chatId,
																			tag,
																			action: selected ? "remove" : "add",
																			subaccountId,
																		})
																	}
																>
																	<span
																		className={`size-3.5 flex shrink-0 items-center justify-center rounded-sm border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
																	>
																		{selected ? <CheckIcon className="size-3" /> : null}
																	</span>
																	<span className="truncate">{tag}</span>
																</button>
															);
														})}
														{query && !exactMatch ? (
															<button
																type="button"
																className="gap-2 px-2 py-1.5 text-sm rounded flex w-full items-center text-left text-primary hover:bg-foreground/5"
																disabled={setTags.isPending}
																onClick={() => {
																	addTag();
																}}
															>
																<PlusIcon className="size-3.5 shrink-0" />
																<span className="truncate">Create “{tagInput.trim()}”</span>
															</button>
														) : null}
														{options.length === 0 && !query ? (
															<p className="px-2 py-3 text-xs text-foreground/65">
																No tags yet — type to create one.
															</p>
														) : null}
													</>
												);
											})()
										)}
									</div>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					{/* Fields */}
					<div className="gap-2 p-3 flex flex-col rounded-lg border bg-background">
						<span className="font-medium text-xs text-foreground/75">Contact</span>
						{profile.fields.map((field) => (
							<div key={field.key} className="gap-0.5 flex flex-col">
								<span className="text-[11px] text-foreground/65">{field.label}</span>
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
										{field.value || <span className="text-foreground/55">—</span>}
									</button>
								) : (
									<span className="text-sm">{field.value || "—"}</span>
								)}
							</div>
						))}
					</div>

					{/* Custom fields, grouped by GHL folder */}
					{(customFieldsQuery.data?.folders.length ?? 0) > 0 ? (
						<div className="gap-2 flex flex-col">
							<div className="flex items-center justify-between">
								<span className="font-medium text-xs text-foreground/75">Custom Fields</span>
								<Popover open={folderSettingsOpen} onOpenChange={setFolderSettingsOpen}>
									<PopoverTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-6 text-foreground/65"
											aria-label="Choose which folders to show"
										>
											<SlidersHorizontalIcon className="size-3.5" />
										</Button>
									</PopoverTrigger>
									<PopoverContent align="end" className="p-1.5 w-60">
										<button
											type="button"
											className="gap-2 px-2 py-1.5 text-sm rounded flex w-full items-center text-left hover:bg-foreground/5"
											onClick={toggleHideEmpty}
										>
											<span
												className={`size-3.5 flex shrink-0 items-center justify-center rounded-sm border ${hideEmptyFields ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
											>
												{hideEmptyFields ? <CheckIcon className="size-3" /> : null}
											</span>
											<span className="truncate">Hide empty fields</span>
										</button>
										<div className="my-1 border-t" />
										<p className="px-1.5 pb-1 text-[11px] text-foreground/65">Folders to display</p>
										<div className="max-h-64 overflow-y-auto">
											{(customFieldsQuery.data?.folders ?? []).map((folder) => {
												const visible = !hiddenFolders.has(folder.id);
												return (
													<button
														key={folder.id}
														type="button"
														className="gap-2 px-2 py-1.5 text-sm rounded flex w-full items-center text-left hover:bg-foreground/5"
														onClick={() => toggleHiddenFolder(folder.id)}
													>
														<span
															className={`size-3.5 flex shrink-0 items-center justify-center rounded-sm border ${visible ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
														>
															{visible ? <CheckIcon className="size-3" /> : null}
														</span>
														<span className="truncate">{folder.name}</span>
													</button>
												);
											})}
										</div>
									</PopoverContent>
								</Popover>
							</div>

							{(customFieldsQuery.data?.folders ?? [])
								.filter((folder) => !hiddenFolders.has(folder.id))
								.map((folder) => {
									const collapsed = collapsedFolders.has(folder.id);
									const setCount = folder.fields.filter((f) => f.value).length;
									const shownFields = hideEmptyFields
										? folder.fields.filter((f) => f.value)
										: folder.fields;
									// With "hide empty" on, a folder whose fields are all empty drops out.
									if (shownFields.length === 0) {
										return null;
									}
									return (
										<div key={folder.id} className="rounded-lg border bg-background">
											<button
												type="button"
												className="gap-2 px-3 py-2 text-sm flex w-full items-center justify-between"
												onClick={() => toggleCollapsedFolder(folder.id)}
											>
												<span className="gap-1.5 font-medium flex items-center">
													{collapsed ? (
														<ChevronRightIcon className="size-3.5 text-foreground/65" />
													) : (
														<ChevronDownIcon className="size-3.5 text-foreground/65" />
													)}
													{folder.name}
												</span>
												<span className="text-[11px] text-foreground/55">
													{setCount}/{folder.fields.length}
												</span>
											</button>
											{collapsed ? null : (
												<div className="gap-2 px-3 pt-0 pb-3 flex flex-col">
													{shownFields.map((field) => (
														<div key={field.id} className="gap-0.5 flex flex-col">
															<span className="text-[11px] text-foreground/65">{field.name}</span>
															<span className="text-sm">
																{field.value || <span className="text-foreground/55">—</span>}
															</span>
														</div>
													))}
												</div>
											)}
										</div>
									);
								})}
						</div>
					) : null}

					{/* GHL status — only surfaced when there's something actionable. */}
					{profile.ghl.connected ? null : (
						<div className="p-3 text-xs mt-auto rounded-lg border border-dashed">
							<p className="text-foreground/75">
								<span className="font-medium text-foreground">GoHighLevel not connected.</span>{" "}
								Owner and tags are saved here and will sync to the contact once you connect GHL.
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/** Read a persisted set of ids (custom-field folder visibility). SSR-safe. */
function readIdSet(key: string): Set<string> {
	if (typeof window === "undefined") {
		return new Set();
	}
	try {
		const raw = window.localStorage.getItem(key);
		const parsed = raw ? (JSON.parse(raw) as unknown) : null;
		return new Set(
			Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [],
		);
	} catch {
		return new Set();
	}
}

function writeIdSet(key: string, value: Set<string>): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(key, JSON.stringify([...value]));
	} catch {
		// Storage unavailable (private mode / quota) — visibility just won't persist.
	}
}

/** Read a persisted boolean flag. SSR-safe; defaults false. */
function readFlag(key: string): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		return window.localStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function writeFlag(key: string, value: boolean): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(key, value ? "1" : "0");
	} catch {
		// Storage unavailable — the flag just won't persist.
	}
}
