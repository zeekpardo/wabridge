"use client";

import { cn } from "@repo/ui";
import { Spinner } from "@repo/ui/components/spinner";
import { FileIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { messageTime } from "./helpers";
import { LinkPreview } from "./LinkPreview";

const URL_RE = /https?:\/\/[^\s]+/i;

interface ThreadMessage {
	id: string;
	direction: string;
	body: string | null;
	type: string;
	timestamp: Date | string;
	media?: { kind: string; dataUrl: string | null; mimetype?: string | null } | null;
}

const VOICE_KINDS = new Set(["audio", "ptt", "voice"]);

interface MessageThreadProps {
	messages: ThreadMessage[];
	isLoading: boolean;
}

export function MessageThread({ messages, isLoading }: MessageThreadProps) {
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

	return (
		<div className="gap-1 p-4 flex flex-1 flex-col overflow-y-auto bg-muted/20">
			{messages.map((message) => (
				<MessageBubble key={message.id} message={message} />
			))}
			<div ref={bottomRef} />
		</div>
	);
}

function MessageBubble({ message }: { message: ThreadMessage }) {
	const isOutbound = message.direction === "outbound";
	const media = message.media;
	const isVoice = Boolean(media && VOICE_KINDS.has(media.kind) && media.dataUrl);
	const isImage = Boolean(media?.dataUrl) && !isVoice;
	const emptyText = !media && !message.body;
	const linkUrl = !media && message.body ? (message.body.match(URL_RE)?.[0] ?? null) : null;

	return (
		<div className={cn("group flex flex-col", isOutbound ? "items-end" : "items-start")}>
			<div
				className={cn(
					"text-sm shadow-sm sm:max-w-[70%] max-w-[80%] overflow-hidden rounded-2xl break-words",
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
	);
}
