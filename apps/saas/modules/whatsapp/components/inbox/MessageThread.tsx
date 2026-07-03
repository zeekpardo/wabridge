"use client";

import { cn } from "@repo/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import {
	CornerUpLeftIcon,
	FileIcon,
	ForwardIcon,
	MoreVerticalIcon,
	PlayIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { messageTime, prettyPhone } from "./helpers";
import { LinkPreview } from "./LinkPreview";

const URL_RE = /https?:\/\/[^\s]+/i;

/** Small emoji set offered in the per-message react menu. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export interface ThreadMessageReaction {
	emoji: string;
	senderId: string;
	fromMe: boolean;
}

export interface ThreadMessage {
	id: string;
	direction: string;
	body: string | null;
	type: string;
	timestamp: Date | string;
	status?: string | null;
	sessionId?: string | null;
	/** Display name of the staff user who sent an outbound message, when known. */
	sentByName?: string | null;
	/** Display name of the group sender for an inbound group message, when known. */
	authorName?: string | null;
	media?: { kind: string; dataUrl: string | null; mimetype?: string | null } | null;
	/** WhatsApp-side id of this message, used to resolve replies/reactions. */
	waMessageId?: string | null;
	/** WhatsApp-side id of the message this one is quoting/replying to, when any. */
	quotedMessageId?: string | null;
	/** Inbound + outbound reactions currently on this message. */
	reactions?: ThreadMessageReaction[] | null;
	/** True when the message was deleted/revoked for everyone. */
	deleted?: boolean | null;
}

export interface ThreadNumber {
	id: string;
	label?: string | null;
	phone?: string | null;
}

export interface ThreadContact {
	name: string;
	phone: string | null;
	/** Remote profile-picture URL for the contact, when known. */
	avatarUrl?: string | null;
	/** True when this thread is a WhatsApp group chat. */
	isGroup?: boolean;
	/** Participant count for a group thread, when known. */
	memberCount?: number | null;
}

const VOICE_KINDS = new Set(["audio", "ptt", "voice"]);

export interface MessageThreadProps {
	messages: ThreadMessage[];
	isLoading: boolean;
	contact: ThreadContact;
	numbers: ThreadNumber[];
	/** Fallback sending number when a message has no sessionId (older/history rows). */
	fallbackNumberId?: string | null;
	onReply?: (message: ThreadMessage) => void;
	onReact?: (message: ThreadMessage, emoji: string) => void;
	onForward?: (message: ThreadMessage) => void;
	onDelete?: (message: ThreadMessage) => void;
}

/** Outbound WhatsApp ack → label + tone for the hover tooltip. */
function statusMeta(status: string | null | undefined): { label: string; tone: string } {
	switch (status) {
		case "read":
			return { label: "Read", tone: "text-sky-400" };
		case "delivered":
			return { label: "Delivered", tone: "text-emerald-400" };
		case "played":
			return { label: "Played", tone: "text-sky-400" };
		case "failed":
		case "error":
			return { label: "Failed", tone: "text-red-400" };
		case "sent":
			return { label: "Sent", tone: "text-foreground/60" };
		default:
			return { label: "Pending", tone: "text-foreground/60" };
	}
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

function fullTimestamp(value: Date | string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** Collapse a message down to a one-line preview for the quoted-reply chip. */
function replyPreviewText(message: ThreadMessage): string {
	if (message.deleted) {
		return "Deleted message";
	}
	if (message.body?.trim()) {
		return message.body;
	}
	if (message.media) {
		return `[${message.media.kind}]`;
	}
	return `[${message.type}]`;
}

/** Group identical emoji into { emoji, count, fromMe } chips for the reaction row. */
function summarizeReactions(
	reactions: ThreadMessageReaction[],
): Array<{ emoji: string; count: number; fromMe: boolean }> {
	const byEmoji = new Map<string, { emoji: string; count: number; fromMe: boolean }>();
	for (const reaction of reactions) {
		if (!reaction.emoji) {
			continue;
		}
		const existing = byEmoji.get(reaction.emoji);
		if (existing) {
			existing.count += 1;
			existing.fromMe = existing.fromMe || reaction.fromMe;
		} else {
			byEmoji.set(reaction.emoji, {
				emoji: reaction.emoji,
				count: 1,
				fromMe: reaction.fromMe,
			});
		}
	}
	return Array.from(byEmoji.values());
}

export function MessageThread({
	messages,
	isLoading,
	contact,
	numbers,
	fallbackNumberId,
	onReply,
	onReact,
	onForward,
	onDelete,
}: MessageThreadProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastMessageId = messages.at(-1)?.id;

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: "end" });
	}, [lastMessageId]);

	if (isLoading && messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center bg-muted/20">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="px-4 flex flex-1 items-center justify-center bg-muted/20 text-center">
				<p className="text-sm text-foreground/65">No messages in this conversation yet.</p>
			</div>
		);
	}

	const numbersById = new Map(numbers.map((n) => [n.id, n]));
	// Resolve quoted replies against the messages we already have loaded.
	const messagesByWaId = new Map<string, ThreadMessage>();
	for (const message of messages) {
		if (message.waMessageId) {
			messagesByWaId.set(message.waMessageId, message);
		}
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="gap-1.5 p-4 flex flex-1 flex-col overflow-y-auto bg-muted/20">
				{messages.map((message) => (
					<MessageBubble
						key={message.id}
						message={message}
						contact={contact}
						quoted={
							message.quotedMessageId ? (messagesByWaId.get(message.quotedMessageId) ?? null) : null
						}
						number={
							numbersById.get(message.sessionId ?? "") ??
							(fallbackNumberId ? numbersById.get(fallbackNumberId) : undefined)
						}
						onReply={onReply}
						onReact={onReact}
						onForward={onForward}
						onDelete={onDelete}
					/>
				))}
				<div ref={bottomRef} />
			</div>
		</TooltipProvider>
	);
}

function MessageBubble({
	message,
	contact,
	quoted,
	number,
	onReply,
	onReact,
	onForward,
	onDelete,
}: {
	message: ThreadMessage;
	contact: ThreadContact;
	quoted: ThreadMessage | null;
	number: ThreadNumber | undefined;
	onReply?: (message: ThreadMessage) => void;
	onReact?: (message: ThreadMessage, emoji: string) => void;
	onForward?: (message: ThreadMessage) => void;
	onDelete?: (message: ThreadMessage) => void;
}) {
	const isOutbound = message.direction === "outbound";
	const isDeleted = Boolean(message.deleted);
	const media = isDeleted ? null : message.media;
	const isVoice = Boolean(media && VOICE_KINDS.has(media.kind) && media.dataUrl);
	const isImage = Boolean(media?.dataUrl) && !isVoice;
	const emptyText = !media && !message.body;
	const linkUrl = !media && message.body ? (message.body.match(URL_RE)?.[0] ?? null) : null;

	// Who + which number, for the avatar + hover card. For outbound, the avatar
	// shows the staff user who sent it (when known) — their initials — falling
	// back to the sending number for older rows or GHL-native/automation sends.
	const numberLabel = number?.label || number?.phone || "Your number";
	const senderName = isOutbound
		? message.sentByName?.trim() || numberLabel
		: contact.name || (contact.phone ?? "Contact");
	const fromPhone = isOutbound ? (number?.phone ?? null) : contact.phone;
	const status = statusMeta(message.status);
	const reactions = !isDeleted && message.reactions ? summarizeReactions(message.reactions) : [];
	const hasActions = Boolean(onReply || onReact || onForward || onDelete);
	// In a group thread, label inbound bubbles with the sender's name (WhatsApp-style).
	const groupAuthor = contact.isGroup && !isOutbound ? message.authorName?.trim() || null : null;

	return (
		<div className={cn("group gap-2 flex items-end", isOutbound ? "flex-row-reverse" : "flex-row")}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Avatar className="size-7 mb-4 shrink-0 cursor-default">
						{!isOutbound && contact.avatarUrl ? (
							<AvatarImage src={contact.avatarUrl} alt={senderName} />
						) : null}
						<AvatarFallback
							className={cn(
								"text-[10px]",
								isOutbound ? "bg-primary/15 text-primary" : "bg-muted text-foreground/70",
							)}
						>
							{initials(senderName)}
						</AvatarFallback>
					</Avatar>
				</TooltipTrigger>
				<TooltipContent side={isOutbound ? "left" : "right"} className="max-w-56">
					<div className="gap-0.5 flex flex-col">
						<span className="font-medium">{senderName}</span>
						<span className="text-foreground/60">{fullTimestamp(message.timestamp)}</span>
						{fromPhone ? (
							<span className="text-foreground/60">
								{isOutbound ? "From" : "Sent from"} {prettyPhone(fromPhone)}
							</span>
						) : null}
						{isOutbound ? <span className={status.tone}>{status.label}</span> : null}
					</div>
				</TooltipContent>
			</Tooltip>

			<div className={cn("min-w-0 flex flex-1 flex-col", isOutbound ? "items-end" : "items-start")}>
				{groupAuthor ? (
					<span className="mb-0.5 px-1 text-xs font-medium text-primary/80">{groupAuthor}</span>
				) : null}
				<div
					className={cn("gap-1.5 flex items-center", isOutbound ? "flex-row-reverse" : "flex-row")}
				>
					{isDeleted ? (
						<div
							className={cn(
								"gap-1.5 px-3.5 py-2 text-sm flex items-center rounded-2xl text-foreground/55 italic",
								isOutbound
									? "rounded-br-sm border border-dashed"
									: "rounded-bl-sm border border-dashed bg-card",
							)}
						>
							<Trash2Icon className="size-3.5 shrink-0" />
							This message was deleted
						</div>
					) : (
						<div
							className={cn(
								"text-sm shadow-sm sm:max-w-[70%] min-w-0 max-w-[80%] overflow-hidden rounded-2xl break-words",
								isOutbound
									? "rounded-br-sm bg-primary text-primary-foreground"
									: "rounded-bl-sm border bg-card text-foreground",
								isImage ? "p-1" : "px-3.5 py-2",
							)}
						>
							{quoted ? (
								<div
									className={cn(
										"gap-0.5 mb-1.5 px-2 py-1 text-xs flex flex-col rounded-lg border-l-2",
										isImage && "mx-1.5 mt-1.5",
										isOutbound
											? "border-primary-foreground/50 bg-primary-foreground/10"
											: "border-primary/50 bg-muted",
									)}
								>
									<span className="font-medium opacity-80">
										{quoted.direction === "outbound"
											? quoted.sentByName?.trim() || "You"
											: contact.name || "Contact"}
									</span>
									<span className="truncate opacity-70">{replyPreviewText(quoted)}</span>
								</div>
							) : null}

							{isImage ? (
								<div className="relative">
									{/* biome-ignore lint/a11y/useAltText: WhatsApp media thumbnail */}
									{/* oxlint-disable-next-line jsx-a11y/alt-text */}
									<img
										src={media?.dataUrl ?? ""}
										alt=""
										className="max-h-72 w-full rounded-xl object-cover"
									/>
									{media?.kind === "video" && (
										<span className="size-11 bg-black/55 text-white absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
											<PlayIcon className="size-5 fill-white" />
										</span>
									)}
								</div>
							) : isVoice ? (
								<audio controls src={media?.dataUrl ?? ""} className="h-9 w-56 sm:w-64 max-w-full">
									<track kind="captions" />
								</audio>
							) : media ? (
								<span className="gap-1.5 flex items-center italic opacity-80">
									<FileIcon className="size-4" />
									{media.kind}
								</span>
							) : null}

							{message.body ? (
								<div className={cn("whitespace-pre-wrap", isImage && "px-2.5 py-1.5")}>
									{message.body}
								</div>
							) : null}

							{linkUrl ? (
								<div className={cn(isImage && "px-2.5 pb-1.5")}>
									<LinkPreview url={linkUrl} />
								</div>
							) : null}

							{emptyText ? <span className="italic opacity-60">[{message.type}]</span> : null}
						</div>
					)}

					{hasActions && !isDeleted ? (
						<MessageActions
							message={message}
							isOutbound={isOutbound}
							onReply={onReply}
							onReact={onReact}
							onForward={onForward}
							onDelete={onDelete}
						/>
					) : null}
				</div>

				{reactions.length > 0 ? (
					<div
						className={cn(
							"gap-1 mt-1 flex flex-wrap",
							isOutbound ? "justify-end" : "justify-start",
						)}
					>
						{reactions.map((reaction) => (
							<span
								key={reaction.emoji}
								className={cn(
									"gap-0.5 px-1.5 py-0.5 text-xs shadow-sm flex items-center rounded-full border bg-card",
									reaction.fromMe && "border-primary/50 bg-primary/10",
								)}
							>
								<span>{reaction.emoji}</span>
								{reaction.count > 1 ? (
									<span className="text-foreground/60 tabular-nums">{reaction.count}</span>
								) : null}
							</span>
						))}
					</div>
				) : null}

				<span className="mt-0.5 px-1 text-[10px] text-foreground/55 opacity-0 transition-opacity group-hover:opacity-100">
					{messageTime(message.timestamp)}
				</span>
			</div>
		</div>
	);
}

function MessageActions({
	message,
	isOutbound,
	onReply,
	onReact,
	onForward,
	onDelete,
}: {
	message: ThreadMessage;
	isOutbound: boolean;
	onReply?: (message: ThreadMessage) => void;
	onReact?: (message: ThreadMessage, emoji: string) => void;
	onForward?: (message: ThreadMessage) => void;
	onDelete?: (message: ThreadMessage) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Message actions"
					className="size-7 flex shrink-0 items-center justify-center rounded-full text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground/80 focus-visible:opacity-100 data-[state=open]:opacity-100"
				>
					<MoreVerticalIcon className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={isOutbound ? "end" : "start"} className="min-w-44">
				{onReact ? (
					<div className="gap-0.5 px-1 pb-1 flex items-center justify-between">
						{QUICK_REACTIONS.map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-label={`React ${emoji}`}
								className="size-8 text-base flex items-center justify-center rounded-md transition-colors hover:bg-accent"
								onClick={() => onReact(message, emoji)}
							>
								{emoji}
							</button>
						))}
					</div>
				) : null}

				{onReact && (onReply || onForward || onDelete) ? <DropdownMenuSeparator /> : null}

				{onReply ? (
					<DropdownMenuItem onSelect={() => onReply(message)}>
						<CornerUpLeftIcon className="size-4 mr-2" />
						Reply
					</DropdownMenuItem>
				) : null}

				{onForward ? (
					<DropdownMenuItem onSelect={() => onForward(message)}>
						<ForwardIcon className="size-4 mr-2" />
						Forward
					</DropdownMenuItem>
				) : null}

				{onDelete && isOutbound ? (
					<DropdownMenuItem
						onSelect={() => onDelete(message)}
						className="text-destructive focus:text-destructive"
					>
						<Trash2Icon className="size-4 mr-2" />
						Delete
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
