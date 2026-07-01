"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui";
import type { RouterOutputs } from "@shared/lib/orpc-query-utils";
import { InboxIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { prettyPhone, relativeTime, toChatId } from "./helpers";

type Conversation = RouterOutputs["whatsapp"]["listConversations"][number];

interface ConversationListProps {
	conversations: Conversation[];
	isLoading: boolean;
	selectedChatId: string | null;
	onSelect: (chatId: string) => void;
}

export function ConversationList({
	conversations,
	isLoading,
	selectedChatId,
	onSelect,
}: ConversationListProps) {
	const [showNewChat, setShowNewChat] = useState(false);
	const [phone, setPhone] = useState("");

	function startNewChat() {
		if (phone.length < 8) {
			return;
		}
		onSelect(toChatId(phone));
		setPhone("");
		setShowNewChat(false);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-2 border-b p-3">
				<h3 className="font-medium text-sm">Conversations</h3>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => setShowNewChat((value) => !value)}
				>
					{showNewChat ? (
						<XIcon className="mr-1.5 size-3.5" />
					) : (
						<PlusIcon className="mr-1.5 size-3.5" />
					)}
					New chat
				</Button>
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

			<div className="flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex justify-center py-12">
						<Spinner className="size-5" />
					</div>
				) : conversations.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
						<div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
							<InboxIcon className="size-5 text-primary" />
						</div>
						<p className="font-medium text-sm">No conversations yet</p>
						<p className="text-foreground/60 text-xs">
							Incoming messages appear here, or start a new chat.
						</p>
					</div>
				) : (
					conversations.map((conversation) => (
						<ConversationRow
							key={conversation.id}
							conversation={conversation}
							isSelected={conversation.chatId === selectedChatId}
							onSelect={() => onSelect(conversation.chatId)}
						/>
					))
				)}
			</div>
		</div>
	);
}

interface ConversationRowProps {
	conversation: Conversation;
	isSelected: boolean;
	onSelect: () => void;
}

function ConversationRow({ conversation, isSelected, onSelect }: ConversationRowProps) {
	const name = conversation.contactName || prettyPhone(conversation.chatId);
	const numberLabel = conversation.activeSession?.label || conversation.activeSession?.phone;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
				isSelected && "bg-muted",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="truncate font-medium text-sm">{name}</span>
				<span className="shrink-0 text-foreground/50 text-xs">
					{relativeTime(conversation.lastMessageAt)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-foreground/60 text-xs">
					{conversation.lastMessagePreview || "No messages yet"}
				</span>
				{conversation.unreadCount > 0 && (
					<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
						{conversation.unreadCount}
					</span>
				)}
			</div>
			{numberLabel && (
				<div>
					<Badge status="info">{numberLabel}</Badge>
				</div>
			)}
		</button>
	);
}
