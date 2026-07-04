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
import { Spinner } from "@repo/ui/components/spinner";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, PlusIcon, SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { prettyPhone } from "../inbox/helpers";

interface AddGroupMembersDialogProps {
	subaccountId?: string;
	sessionId: string;
	groupId: string;
	/** Phone digits of members already in the group, so they're hidden from the picker. */
	existingNumbers: string[];
	/** Called with the numbers WhatsApp couldn't add (privacy) so the caller can offer an invite. */
	onAdded: (notAdded: string[]) => void;
}

/** A chosen member: an existing contact (by chatId) or a new person typed in (phone + name → CRM). */
type PickedMember =
	| { kind: "contact"; value: string; label: string; sublabel: string | null }
	| { kind: "new"; phone: string; name: string };

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

export function AddGroupMembersDialog({
	subaccountId,
	sessionId,
	groupId,
	existingNumbers,
	onAdded,
}: AddGroupMembersDialogProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [newPhone, setNewPhone] = useState("");
	const [newName, setNewName] = useState("");
	// Keyed by a stable id so a contact / number can't be added twice.
	const [picked, setPicked] = useState<Map<string, PickedMember>>(new Map());

	const chatsQuery = useQuery({
		...orpc.whatsapp.listChats.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});

	const existing = useMemo(
		() => new Set(existingNumbers.map((n) => n.replace(/\D/g, ""))),
		[existingNumbers],
	);

	const q = query.trim().toLowerCase();

	// Existing 1:1 contacts (never groups, never already-members) offered for selection.
	const contactOptions = useMemo(() => {
		return (chatsQuery.data ?? [])
			.filter((c) => !c.isGroup && !c.chatId.endsWith("@g.us"))
			.filter((c) => {
				const digits = (c.phone ?? c.chatId).replace(/\D/g, "");
				return !existing.has(digits);
			})
			.map((c) => ({
				value: c.chatId,
				label: c.contactName || c.phone || prettyPhone(c.chatId),
				sublabel: c.phone ?? null,
			}))
			.filter(
				(c) =>
					!q || c.label.toLowerCase().includes(q) || (c.sublabel ?? "").toLowerCase().includes(q),
			);
	}, [chatsQuery.data, q, existing]);

	function toggleContact(option: { value: string; label: string; sublabel: string | null }) {
		setPicked((prev) => {
			const next = new Map(prev);
			const key = `contact:${option.value}`;
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.set(key, { kind: "contact", ...option });
			}
			return next;
		});
	}

	const newDigits = newPhone.replace(/\D/g, "");
	const canAddNew = newDigits.length >= 6 && newName.trim().length > 0;

	function addNew() {
		if (!canAddNew) {
			return;
		}
		const phone = `+${newDigits}`;
		setPicked((prev) => {
			const next = new Map(prev);
			next.set(`new:${phone}`, { kind: "new", phone, name: newName.trim() });
			return next;
		});
		setNewPhone("");
		setNewName("");
	}

	function removePicked(key: string) {
		setPicked((prev) => {
			const next = new Map(prev);
			next.delete(key);
			return next;
		});
	}

	function reset() {
		setQuery("");
		setNewPhone("");
		setNewName("");
		setPicked(new Map());
	}

	const addMutation = useMutation(
		orpc.whatsapp.addGroupParticipants.mutationOptions({
			onSuccess: (data) => {
				onAdded(data.notAdded ?? []);
				setOpen(false);
				reset();
			},
			onError: (error) => toastError(error.message ?? "Could not add the members"),
		}),
	);

	const members = [...picked.entries()];
	const canSubmit = members.length > 0;

	function submit() {
		const participants: string[] = [];
		const newContacts: { phone: string; name: string }[] = [];
		for (const [, member] of members) {
			if (member.kind === "contact") {
				participants.push(member.value);
			} else {
				newContacts.push({ phone: member.phone, name: member.name });
			}
		}
		addMutation.mutate({ sessionId, groupId, participants, newContacts, subaccountId });
	}

	function onOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			reset();
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm" className="gap-1.5 self-start">
					<PlusIcon className="size-3.5" />
					Add members
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add members</DialogTitle>
					<DialogDescription>
						Pick from your contacts, or add someone new by phone — they'll be created in the CRM.
					</DialogDescription>
				</DialogHeader>

				<div className="gap-4 flex flex-col">
					{members.length > 0 ? (
						<div className="gap-1.5 flex flex-wrap">
							{members.map(([key, member]) => (
								<span
									key={key}
									className="gap-1 pl-2.5 pr-1 py-1 text-xs flex items-center rounded-full bg-primary/10 text-primary"
								>
									{member.kind === "contact" ? member.label : `${member.name} (${member.phone})`}
									<button
										type="button"
										aria-label="Remove"
										className="p-0.5 rounded-full hover:bg-primary/20"
										onClick={() => removePicked(key)}
									>
										<XIcon className="size-3" />
									</button>
								</span>
							))}
						</div>
					) : null}

					{/* Search existing contacts */}
					<div className="gap-1.5 flex flex-col">
						<Label>From your contacts</Label>
						<div className="gap-1.5 px-2.5 flex items-center rounded-md border">
							<SearchIcon className="size-4 shrink-0 text-foreground/55" />
							<Input
								value={query}
								placeholder="Search contacts"
								className="h-9 px-0 border-0 shadow-none focus-visible:ring-0"
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
						<div className="max-h-48 flex flex-col overflow-y-auto rounded-md border">
							{chatsQuery.isLoading ? (
								<div className="py-6 flex justify-center">
									<Spinner className="size-5" />
								</div>
							) : contactOptions.length === 0 ? (
								<p className="py-6 text-sm text-center text-foreground/60">No matching contacts.</p>
							) : (
								contactOptions.map((contact) => {
									const isPicked = picked.has(`contact:${contact.value}`);
									return (
										<button
											key={contact.value}
											type="button"
											className="gap-2.5 px-2.5 py-1.5 flex items-center border-b text-left last:border-b-0 hover:bg-foreground/5"
											onClick={() => toggleContact(contact)}
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

					{/* Add someone new -> creates a CRM contact */}
					<div className="gap-1.5 flex flex-col">
						<Label>Add someone new</Label>
						<div className="gap-1.5 flex items-center">
							<Input
								value={newName}
								placeholder="Name"
								className="flex-1"
								onChange={(event) => setNewName(event.target.value)}
							/>
							<Input
								value={newPhone}
								placeholder="+1 555 123 4567"
								className="flex-1"
								onChange={(event) => setNewPhone(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && canAddNew) {
										event.preventDefault();
										addNew();
									}
								}}
							/>
							<Button
								type="button"
								size="icon"
								variant="secondary"
								aria-label="Add new contact"
								disabled={!canAddNew}
								onClick={addNew}
							>
								<UserPlusIcon className="size-4" />
							</Button>
						</div>
						<p className="text-xs text-foreground/55">
							Creates the contact in your CRM, then adds them.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button disabled={!canSubmit} loading={addMutation.isPending} onClick={submit}>
						{members.length > 0 ? `Add ${members.length}` : "Add"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
