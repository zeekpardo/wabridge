"use client";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { prettyPhone } from "../inbox/helpers";

interface CreateGroupDialogProps {
	subaccountId?: string;
	onCreated: (created: { sessionId: string; groupId: string }) => void;
}

/** A chosen member — either an existing contact (chatId) or a typed phone number. */
interface PickedMember {
	/** The participant value passed to the gateway: a `@c.us` jid or a raw phone. */
	value: string;
	label: string;
	sublabel: string | null;
}

function initials(value: string): string {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}
	if (parts.length === 1) {
		const digits = parts[0].replace(/\D/g, "");
		return (digits ? digits.slice(-2) : parts[0].slice(0, 2)).toUpperCase();
	}
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function CreateGroupDialog({ subaccountId, onCreated }: CreateGroupDialogProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	// Keyed by member value so a contact and its number can't be added twice.
	const [picked, setPicked] = useState<Map<string, PickedMember>>(new Map());
	// After create: the group + who WhatsApp couldn't add (privacy), so we can offer an invite link.
	const [result, setResult] = useState<{ groupId: string; notAdded: string[] } | null>(null);

	const numbersQuery = useQuery({
		...orpc.whatsapp.listNumbers.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});
	const chatsQuery = useQuery({
		...orpc.whatsapp.listChats.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});

	const numbers = numbersQuery.data ?? [];
	// Default the creating number to the first sendable one.
	const activeSessionId = sessionId ?? numbers[0]?.id ?? "";

	const q = query.trim().toLowerCase();

	// Existing 1:1 contacts (never groups) offered for selection.
	const contactOptions = useMemo(() => {
		return (chatsQuery.data ?? [])
			.filter((c) => !c.isGroup && !c.chatId.endsWith("@g.us"))
			.map((c) => ({
				value: c.chatId,
				label: c.contactName || c.phone || prettyPhone(c.chatId),
				sublabel: c.phone ?? null,
			}))
			.filter(
				(c) =>
					!q || c.label.toLowerCase().includes(q) || (c.sublabel ?? "").toLowerCase().includes(q),
			);
	}, [chatsQuery.data, q]);

	// If the search box looks like a phone number, offer to add it directly.
	const typedNumber = query.trim();
	const typedDigits = typedNumber.replace(/\D/g, "");
	const canAddTyped = typedDigits.length >= 6 && !picked.has(typedNumber);

	function toggle(member: PickedMember) {
		setPicked((prev) => {
			const next = new Map(prev);
			if (next.has(member.value)) {
				next.delete(member.value);
			} else {
				next.set(member.value, member);
			}
			return next;
		});
	}

	function addTyped() {
		if (!canAddTyped) {
			return;
		}
		const value = `+${typedDigits}`;
		setPicked((prev) => {
			const next = new Map(prev);
			next.set(value, { value, label: value, sublabel: "Typed number" });
			return next;
		});
		setQuery("");
	}

	function reset() {
		setName("");
		setSessionId(null);
		setQuery("");
		setPicked(new Map());
		setResult(null);
	}

	const createMutation = useMutation(
		orpc.whatsapp.createGroup.mutationOptions({
			onSuccess: (group) => {
				// Select the new group behind the dialog either way.
				onCreated({ sessionId: activeSessionId, groupId: group.id });
				if (group.notAdded && group.notAdded.length > 0) {
					// Some members couldn't be added (privacy) — keep the dialog open to offer an invite link.
					setResult({ groupId: group.id, notAdded: group.notAdded });
				} else {
					setOpen(false);
					reset();
				}
			},
			onError: (error) => toastError(error.message ?? "Could not create the group"),
		}),
	);
	const inviteMutation = useMutation(
		orpc.whatsapp.inviteToGroup.mutationOptions({
			onSuccess: (data) => {
				toastSuccess(
					data.sent > 0 ? `Invite link sent to ${data.sent}` : "Could not send the invite link",
				);
				setOpen(false);
				reset();
			},
			onError: (error) => toastError(error.message ?? "Could not send the invite link"),
		}),
	);

	const members = [...picked.values()];
	const canSubmit = name.trim().length > 0 && activeSessionId !== "" && members.length > 0;

	function onOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			reset();
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm" className="gap-1.5">
					<PlusIcon className="size-3.5" />
					New group
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Create a group</DialogTitle>
					<DialogDescription>
						Pick the members and the number that creates the group.
					</DialogDescription>
				</DialogHeader>

				{result ? (
					<>
						<div className="gap-3 py-1 flex flex-col">
							<p className="text-sm text-foreground/80">
								Group created. WhatsApp couldn't add{" "}
								<span className="font-medium">
									{result.notAdded.map((n) => prettyPhone(n)).join(", ")}
								</span>{" "}
								directly — their privacy settings require an invite. Send them the group's invite
								link so they can join?
							</p>
						</div>
						<DialogFooter>
							<Button
								variant="ghost"
								disabled={inviteMutation.isPending}
								onClick={() => {
									setOpen(false);
									reset();
								}}
							>
								Skip
							</Button>
							<Button
								className="gap-1.5"
								loading={inviteMutation.isPending}
								onClick={() =>
									inviteMutation.mutate({
										sessionId: activeSessionId,
										groupId: result.groupId,
										phones: result.notAdded,
										subaccountId,
									})
								}
							>
								<PlusIcon className="size-3.5" />
								Send invite link
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<div className="gap-4 flex flex-col">
							<div className="gap-1.5 flex flex-col">
								<Label htmlFor="group-name">Group name</Label>
								<Input
									id="group-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="e.g. Team WhatsApp"
								/>
							</div>

							{numbers.length > 1 ? (
								<div className="gap-1.5 flex flex-col">
									<Label>Create from number</Label>
									<Select value={activeSessionId} onValueChange={setSessionId}>
										<SelectTrigger>
											<SelectValue placeholder="Choose a number" />
										</SelectTrigger>
										<SelectContent>
											{numbers.map((number) => (
												<SelectItem key={number.id} value={number.id}>
													{number.label || number.phone || "Unnamed number"}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : null}

							<div className="gap-1.5 flex flex-col">
								<Label>Members</Label>

								{members.length > 0 ? (
									<div className="gap-1.5 flex flex-wrap">
										{members.map((member) => (
											<span
												key={member.value}
												className="gap-1 pl-2.5 pr-1 py-1 text-xs flex items-center rounded-full bg-primary/10 text-primary"
											>
												{member.label}
												<button
													type="button"
													aria-label={`Remove ${member.label}`}
													className="p-0.5 rounded-full hover:bg-primary/20"
													onClick={() => toggle(member)}
												>
													<XIcon className="size-3" />
												</button>
											</span>
										))}
									</div>
								) : null}

								<div className="gap-1.5 px-2.5 flex items-center rounded-md border">
									<SearchIcon className="size-4 shrink-0 text-foreground/55" />
									<Input
										value={query}
										placeholder="Search contacts or type a phone number"
										className="h-9 px-0 border-0 shadow-none focus-visible:ring-0"
										onChange={(event) => setQuery(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter" && canAddTyped) {
												event.preventDefault();
												addTyped();
											}
										}}
									/>
								</div>

								<div className="max-h-56 flex flex-col overflow-y-auto rounded-md border">
									{canAddTyped ? (
										<button
											type="button"
											className="gap-2.5 px-2.5 py-2 flex items-center border-b text-left hover:bg-foreground/5"
											onClick={addTyped}
										>
											<div className="size-8 flex items-center justify-center rounded-full bg-primary/10">
												<PlusIcon className="size-4 text-primary" />
											</div>
											<div className="min-w-0">
												<p className="text-sm">Add “+{typedDigits}”</p>
												<p className="text-xs text-foreground/60">Invite by phone number</p>
											</div>
										</button>
									) : null}

									{chatsQuery.isLoading ? (
										<div className="py-6 flex justify-center">
											<Spinner className="size-5" />
										</div>
									) : contactOptions.length === 0 && !canAddTyped ? (
										<p className="py-6 text-sm text-center text-foreground/60">
											No matching contacts.
										</p>
									) : (
										contactOptions.map((contact) => {
											const isPicked = picked.has(contact.value);
											return (
												<button
													key={contact.value}
													type="button"
													className="gap-2.5 px-2.5 py-1.5 flex items-center border-b text-left last:border-b-0 hover:bg-foreground/5"
													onClick={() => toggle(contact)}
												>
													<Avatar className="size-8">
														<AvatarFallback className="bg-muted text-[10px] text-foreground/70">
															{initials(contact.label)}
														</AvatarFallback>
													</Avatar>
													<div className="min-w-0 flex-1">
														<p className="text-sm truncate">{contact.label}</p>
														{contact.sublabel ? (
															<p className="text-xs truncate text-foreground/60">
																{prettyPhone(contact.sublabel)}
															</p>
														) : null}
													</div>
													{isPicked ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
												</button>
											);
										})
									)}
								</div>
							</div>
						</div>

						<DialogFooter>
							<Button variant="ghost" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button
								disabled={!canSubmit}
								loading={createMutation.isPending}
								onClick={() =>
									createMutation.mutate({
										sessionId: activeSessionId,
										name: name.trim(),
										participants: members.map((member) => member.value),
										subaccountId,
									})
								}
							>
								Create group
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
