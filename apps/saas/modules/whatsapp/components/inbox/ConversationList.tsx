"use client";

import { cn } from "@repo/ui";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import type { RouterOutputs } from "@shared/lib/orpc-query-utils";
import { InboxIcon, MailIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { prettyPhone, relativeTime, toChatId } from "./helpers";

type Chat = RouterOutputs["whatsapp"]["listChats"][number];

interface ConversationListProps {
	conversations: Chat[];
	isLoading: boolean;
	selectedChatId: string | null;
	onSelect: (chatId: string) => void;
	/** Mark a conversation unread (row hover action). */
	onMarkUnread?: (chatId: string) => void;
	/** Filter control (button + active-filter chips), shown beside the search box. */
	filters?: ReactNode;
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
	onMarkUnread,
	filters,
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
			<div className="gap-2 px-3 py-2.5 flex items-center justify-between border-b">
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

			<div className="gap-2 p-2 flex flex-wrap items-center border-b">
				<div className="min-w-40 relative flex-1">
					<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-foreground/75" />
					<Input
						className="h-9 pl-8"
						placeholder="Search name or number…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				{filters}
			</div>

			{showNewChat && (
				<div className="gap-2 p-3 flex items-end border-b">
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

			<div className="p-1.5 flex-1 overflow-y-auto">
				{isLoading && conversations.length === 0 ? (
					<div className="py-12 flex justify-center">
						<Spinner className="size-5" />
					</div>
				) : filtered.length === 0 ? (
					<div className="gap-2 px-4 py-12 flex flex-col items-center text-center">
						<div className="size-10 flex items-center justify-center rounded-full bg-primary/10">
							<InboxIcon className="size-5 text-primary" />
						</div>
						<p className="font-medium text-sm">{search ? "No matches" : "No conversations yet"}</p>
						<p className="text-xs text-foreground/75">
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
							onMarkUnread={onMarkUnread ? () => onMarkUnread(chat.chatId) : undefined}
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
	/** Mark this conversation unread; hover action rendered when provided. */
	onMarkUnread?: () => void;
}

function ConversationRow({ chat, isSelected, onSelect, onMarkUnread }: ConversationRowProps) {
	const name = displayName(chat);
	const numberLabel = chat.activeSession?.label || chat.activeSession?.phone;
	const hasUnread = chat.unreadCount > 0;

	return (
		<div className="group relative">
			<button
				type="button"
				onClick={onSelect}
				className={cn(
					"gap-3 px-2.5 py-2 flex w-full items-center rounded-lg text-left transition-colors hover:bg-muted/60",
					isSelected && "bg-muted",
				)}
			>
				<Avatar className="size-9 shrink-0">
					<AvatarFallback className={cn("text-xs", isSelected && "bg-primary/15 text-primary")}>
						{chat.isGroup ? <UsersIcon className="size-4" /> : avatarText(name)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="gap-2 flex items-center justify-between">
						<span className={cn("text-sm truncate", hasUnread ? "font-semibold" : "font-medium")}>
							{name}
						</span>
						<span className="shrink-0 text-[11px] text-foreground/55">
							{relativeTime(chat.lastMessageAt)}
						</span>
					</div>
					<div className="gap-2 flex items-center justify-between">
						<span
							className={cn(
								"text-xs truncate",
								hasUnread ? "text-foreground/80" : "text-foreground/55",
							)}
						>
							{chat.lastMessagePreview || "No messages yet"}
						</span>
						{hasUnread && (
							<span className="size-5 min-w-5 px-1 flex shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
								{chat.unreadCount}
							</span>
						)}
					</div>
					{numberLabel && (
						<span className="mt-0.5 block truncate text-[10px] text-foreground/55">
							via {numberLabel}
						</span>
					)}
				</div>
			</button>

			{onMarkUnread && (
				<button
					type="button"
					aria-label="Mark as unread"
					title="Mark as unread"
					className="right-2 top-2 size-6 absolute flex items-center justify-center rounded-md bg-card text-foreground/55 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus:opacity-100"
					onClick={(e) => {
						e.stopPropagation();
						onMarkUnread();
					}}
				>
					<MailIcon className="size-3.5" />
				</button>
			)}
		</div>
	);
}
