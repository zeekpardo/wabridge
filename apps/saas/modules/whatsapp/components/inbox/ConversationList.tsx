"use client";

import { cn } from "@repo/ui";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import type { RouterOutputs } from "@shared/lib/orpc-query-utils";
import { InboxIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { prettyPhone, relativeTime, toChatId } from "./helpers";

type Chat = RouterOutputs["whatsapp"]["listChats"][number];

interface ConversationListProps {
	conversations: Chat[];
	isLoading: boolean;
	selectedChatId: string | null;
	onSelect: (chatId: string) => void;
}

function displayName(chat: Chat): string {
	return chat.contactName || chat.phone || prettyPhone(chat.chatId);
}

function avatarText(name: string): string {
	const letters = name.replace(/[^a-zA-Z]/g, " ").trim();
	if (letters) {
		return letters
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join("")
			.toUpperCase();
	}
	const digits = name.replace(/\D/g, "");
	return digits.slice(-2) || "#";
}

export function ConversationList({
	conversations,
	isLoading,
	selectedChatId,
	onSelect,
}: ConversationListProps) {
	const [showNewChat, setShowNewChat] = useState(false);
	const [phone, setPhone] = useState("");
	const [search, setSearch] = useState("");

	function startNewChat() {
		if (phone.length < 8) {
			return;
		}
		onSelect(toChatId(phone));
		setPhone("");
		setShowNewChat(false);
	}

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) {
			return conversations;
		}
		const digits = term.replace(/\D/g, "");
		return conversations.filter((chat) => {
			const name = displayName(chat).toLowerCase();
			const chatDigits = chat.chatId.replace(/\D/g, "");
			return name.includes(term) || (digits.length > 0 && chatDigits.includes(digits));
		});
	}, [conversations, search]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
				<h3 className="font-semibold text-sm">Chats</h3>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2 text-xs"
					onClick={() => setShowNewChat((value) => !value)}
				>
					{showNewChat ? <XIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
					New chat
				</Button>
			</div>

			<div className="border-b p-2">
				<div className="relative">
					<SearchIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-foreground/40" />
					<Input
						className="h-9 pl-8"
						placeholder="Search name or number…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			{showNewChat && (
				<div className="flex items-end gap-2 border-b p-3">
					<Input
						// oxlint-disable-next-line no-autofocus
						autoFocus
						inputMode="numeric"
						placeholder="15555550100"
						value={phone}
						onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								startNewChat();
							}
						}}
					/>
					<Button size="sm" disabled={phone.length < 8} onClick={startNewChat}>
						Start
					</Button>
				</div>
			)}

			<div className="flex-1 overflow-y-auto p-1.5">
				{isLoading && conversations.length === 0 ? (
					<div className="flex justify-center py-12">
						<Spinner className="size-5" />
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
						<div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
							<InboxIcon className="size-5 text-primary" />
						</div>
						<p className="font-medium text-sm">
							{search ? "No matches" : "No conversations yet"}
						</p>
						<p className="text-foreground/60 text-xs">
							{search
								? "Try a different name or number."
								: "Incoming messages appear here, or start a new chat."}
						</p>
					</div>
				) : (
					filtered.map((chat) => (
						<ConversationRow
							key={chat.chatId}
							chat={chat}
							isSelected={chat.chatId === selectedChatId}
							onSelect={() => onSelect(chat.chatId)}
						/>
					))
				)}
			</div>
		</div>
	);
}

interface ConversationRowProps {
	chat: Chat;
	isSelected: boolean;
	onSelect: () => void;
}

function ConversationRow({ chat, isSelected, onSelect }: ConversationRowProps) {
	const name = displayName(chat);
	const numberLabel = chat.activeSession?.label || chat.activeSession?.phone;
	const hasUnread = chat.unreadCount > 0;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
				isSelected && "bg-muted",
			)}
		>
			<Avatar className="size-9 shrink-0">
				<AvatarFallback className={cn("text-xs", isSelected && "bg-primary/15 text-primary")}>
					{chat.isGroup ? <UsersIcon className="size-4" /> : avatarText(name)}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<span className={cn("truncate text-sm", hasUnread ? "font-semibold" : "font-medium")}>
						{name}
					</span>
					<span className="shrink-0 text-[11px] text-foreground/40">
						{relativeTime(chat.lastMessageAt)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-2">
					<span
						className={cn(
							"truncate text-xs",
							hasUnread ? "text-foreground/80" : "text-foreground/55",
						)}
					>
						{chat.lastMessagePreview || "No messages yet"}
					</span>
					{hasUnread && (
						<span className="flex size-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
							{chat.unreadCount}
						</span>
					)}
				</div>
				{numberLabel && (
					<span className="mt-0.5 block truncate text-[10px] text-foreground/40">
						via {numberLabel}
					</span>
				)}
			</div>
		</button>
	);
}
