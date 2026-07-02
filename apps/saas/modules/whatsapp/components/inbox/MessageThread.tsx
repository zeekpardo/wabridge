"use client";

import { cn } from "@repo/ui";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { FileIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { messageTime, prettyPhone } from "./helpers";
import { LinkPreview } from "./LinkPreview";

const URL_RE = /https?:\/\/[^\s]+/i;

export interface ThreadMessage {
	id: string;
	direction: string;
	body: string | null;
	type: string;
	timestamp: Date | string;
	status?: string | null;
	sessionId?: string | null;
	media?: { kind: string; dataUrl: string | null; mimetype?: string | null } | null;
}

export interface ThreadNumber {
	id: string;
	label?: string | null;
	phone?: string | null;
}

export interface ThreadContact {
	name: string;
	phone: string | null;
}

const VOICE_KINDS = new Set(["audio", "ptt", "voice"]);

interface MessageThreadProps {
	messages: ThreadMessage[];
	isLoading: boolean;
	contact: ThreadContact;
	numbers: ThreadNumber[];
	/** Fallback sending number when a message has no sessionId (older/history rows). */
	fallbackNumberId?: string | null;
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

export function MessageThread({
	messages,
	isLoading,
	contact,
	numbers = [],
	fallbackNumberId,
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

	return (
		<TooltipProvider delayDuration={150}>
			<div className="gap-1.5 p-4 flex flex-1 flex-col overflow-y-auto bg-muted/20">
				{messages.map((message) => (
					<MessageBubble
						key={message.id}
						message={message}
						contact={contact}
						number={
							numbersById.get(message.sessionId ?? "") ??
							(fallbackNumberId ? numbersById.get(fallbackNumberId) : undefined)
						}
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
	number,
}: {
	message: ThreadMessage;
	contact: ThreadContact;
	number: ThreadNumber | undefined;
}) {
	const isOutbound = message.direction === "outbound";
	const media = message.media;
	const isVoice = Boolean(media && VOICE_KINDS.has(media.kind) && media.dataUrl);
	const isImage = Boolean(media?.dataUrl) && !isVoice;
	const emptyText = !media && !message.body;
	const linkUrl = !media && message.body ? (message.body.match(URL_RE)?.[0] ?? null) : null;

	// Who + which number, for the avatar + hover card.
	const senderName = isOutbound
		? number?.label || number?.phone || "Your number"
		: contact.name || (contact.phone ?? "Contact");
	const fromPhone = isOutbound ? (number?.phone ?? null) : contact.phone;
	const status = statusMeta(message.status);

	return (
		<div className={cn("group gap-2 flex items-end", isOutbound ? "flex-row-reverse" : "flex-row")}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Avatar className="size-7 mb-4 shrink-0 cursor-default">
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
				<div
					className={cn(
						"text-sm shadow-sm sm:max-w-[70%] max-w-[80%] min-w-0 overflow-hidden rounded-2xl break-words",
						isOutbound
							? "rounded-br-sm bg-primary text-primary-foreground"
							: "rounded-bl-sm border bg-card text-foreground",
						isImage ? "p-1" : "px-3.5 py-2",
					)}
				>
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
				<span className="mt-0.5 px-1 text-[10px] text-foreground/55 opacity-0 transition-opacity group-hover:opacity-100">
					{messageTime(message.timestamp)}
				</span>
			</div>
		</div>
	);
}
