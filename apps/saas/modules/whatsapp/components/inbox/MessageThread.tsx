"use client";

import { cn } from "@repo/ui";
import { Spinner } from "@repo/ui/components/spinner";
import { FileIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { LinkPreview } from "./LinkPreview";
import { messageTime } from "./helpers";

const URL_RE = /https?:\/\/[^\s]+/i;

interface ThreadMessage {
	id: string;
	direction: string;
	body: string | null;
	type: string;
	timestamp: Date | string;
	media?: { kind: string; dataUrl: string | null } | null;
}

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
			<div className="flex flex-1 items-center justify-center bg-muted/20 px-4 text-center">
				<p className="text-foreground/50 text-sm">No messages in this conversation yet.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-1 overflow-y-auto bg-muted/20 p-4">
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
	const hasImage = Boolean(media?.dataUrl);
	const emptyText = !media && !message.body;
	const linkUrl = !media && message.body ? (message.body.match(URL_RE)?.[0] ?? null) : null;

	return (
		<div className={cn("group flex flex-col", isOutbound ? "items-end" : "items-start")}>
			<div
				className={cn(
					"max-w-[80%] overflow-hidden break-words rounded-2xl text-sm shadow-sm sm:max-w-[70%]",
					isOutbound
						? "rounded-br-sm bg-primary text-primary-foreground"
						: "rounded-bl-sm border bg-card text-foreground",
					hasImage ? "p-1" : "px-3.5 py-2",
				)}
			>
				{hasImage ? (
					<div className="relative">
						{/* biome-ignore lint/a11y/useAltText: WhatsApp media thumbnail */}
						{/* oxlint-disable-next-line jsx-a11y/alt-text */}
						<img
							src={media?.dataUrl ?? ""}
							alt=""
							className="max-h-72 w-full rounded-xl object-cover"
						/>
						{media?.kind === "video" && (
							<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex size-11 items-center justify-center rounded-full bg-black/55 text-white">
								<PlayIcon className="size-5 fill-white" />
							</span>
						)}
					</div>
				) : media ? (
					<span className="flex items-center gap-1.5 italic opacity-80">
						<FileIcon className="size-4" />
						{media.kind}
					</span>
				) : null}

				{message.body ? (
					<div className={cn("whitespace-pre-wrap", hasImage && "px-2.5 py-1.5")}>
						{message.body}
					</div>
				) : null}

				{linkUrl ? (
					<div className={cn(hasImage && "px-2.5 pb-1.5")}>
						<LinkPreview url={linkUrl} />
					</div>
				) : null}

				{emptyText ? <span className="italic opacity-60">[{message.type}]</span> : null}
			</div>
			<span className="mt-0.5 px-1 text-[10px] text-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
				{messageTime(message.timestamp)}
			</span>
		</div>
	);
}
