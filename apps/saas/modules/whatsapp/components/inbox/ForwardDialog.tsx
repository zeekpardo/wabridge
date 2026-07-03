"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, UserIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { prettyPhone } from "./helpers";

export interface ForwardTarget {
	toChatId?: string;
	toPhone?: string;
}

interface ForwardContact {
	chatId: string;
	contactName: string | null;
	phone: string | null;
}

interface ForwardDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	subaccountId?: string;
	/** The existing conversations to offer as "Contacts" (already loaded by the inbox). */
	contacts: ForwardContact[];
	/** The chat the message is coming from — excluded from the contacts list. */
	fromChatId: string | null;
	onSelect: (target: ForwardTarget) => void;
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

export function ForwardDialog({
	open,
	onOpenChange,
	subaccountId,
	contacts,
	fromChatId,
	onSelect,
}: ForwardDialogProps) {
	const [query, setQuery] = useState("");

	// The owners list (GHL staff when connected, else agency members) — the same
	// people as the contact-owner dropdown. Only those with a phone are forwardable.
	const ownersQuery = useQuery({
		...orpc.whatsapp.listContactOwners.queryOptions({ input: { subaccountId } }),
		enabled: open,
	});

	const q = query.trim().toLowerCase();

	const contactOptions = useMemo(() => {
		return contacts
			.filter((c) => c.chatId !== fromChatId && !c.chatId.endsWith("@g.us"))
			.map((c) => ({
				chatId: c.chatId,
				name: c.contactName || c.phone || prettyPhone(c.chatId),
				phone: c.phone,
			}))
			.filter(
				(c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
			);
	}, [contacts, fromChatId, q]);

	const teamOptions = useMemo(() => {
		return (ownersQuery.data ?? [])
			.filter((o) => Boolean(o.phone))
			.filter((o) => !q || o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q));
	}, [ownersQuery.data, q]);

	function pick(target: ForwardTarget) {
		onSelect(target);
		onOpenChange(false);
		setQuery("");
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setQuery("");
				}
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Forward to…</DialogTitle>
					<DialogDescription>Send this message to a contact or a team member.</DialogDescription>
				</DialogHeader>

				<div className="gap-1.5 px-2.5 flex items-center rounded-md border">
					<SearchIcon className="size-4 shrink-0 text-foreground/55" />
					<Input
						// oxlint-disable-next-line no-autofocus
						autoFocus
						value={query}
						placeholder="Search people"
						className="h-9 px-0 border-0 shadow-none focus-visible:ring-0"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>

				<Tabs defaultValue="contacts">
					<TabsList className="w-full">
						<TabsTrigger value="contacts" className="flex-1">
							Contacts
						</TabsTrigger>
						<TabsTrigger value="team" className="flex-1">
							Team
						</TabsTrigger>
					</TabsList>

					<TabsContent value="contacts">
						<div className="max-h-72 flex flex-col overflow-y-auto">
							{contactOptions.length === 0 ? (
								<p className="py-6 text-sm text-center text-foreground/60">No matching contacts.</p>
							) : (
								contactOptions.map((c) => (
									<button
										key={c.chatId}
										type="button"
										className="gap-2.5 px-2 py-1.5 flex items-center rounded-md text-left hover:bg-foreground/5"
										onClick={() => pick({ toChatId: c.chatId })}
									>
										<Avatar className="size-8">
											<AvatarFallback className="bg-muted text-[10px] text-foreground/70">
												{initials(c.name)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<p className="text-sm truncate">{c.name}</p>
											{c.phone ? (
												<p className="text-xs truncate text-foreground/60">
													{prettyPhone(c.phone)}
												</p>
											) : null}
										</div>
									</button>
								))
							)}
						</div>
					</TabsContent>

					<TabsContent value="team">
						<div className="max-h-72 flex flex-col overflow-y-auto">
							{ownersQuery.isLoading ? (
								<div className="py-6 flex justify-center">
									<Spinner className="size-5" />
								</div>
							) : teamOptions.length === 0 ? (
								<p className="px-3 py-6 text-sm text-center text-foreground/60">
									No team members with a phone number to forward to.
								</p>
							) : (
								teamOptions.map((o) => (
									<button
										key={o.id}
										type="button"
										className="gap-2.5 px-2 py-1.5 flex items-center rounded-md text-left hover:bg-foreground/5"
										onClick={() => pick({ toPhone: o.phone ?? undefined })}
									>
										<Avatar className="size-8">
											{o.image ? <AvatarImage src={o.image} alt="" /> : null}
											<AvatarFallback className="bg-primary/10 text-[10px] text-primary">
												<UserIcon className="size-3.5" />
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0 flex-1">
											<p className="text-sm truncate">{o.name}</p>
											<p className="text-xs truncate text-foreground/60">
												{o.phone ? prettyPhone(o.phone) : o.email}
											</p>
										</div>
									</button>
								))
							)}
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
