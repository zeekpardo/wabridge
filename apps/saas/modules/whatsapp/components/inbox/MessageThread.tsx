"use client";

import { cn } from "@repo/ui";
import { Spinner } from "@repo/ui/components/spinner";
import type { RouterOutputs } from "@shared/lib/orpc-query-utils";
import { useEffect, useRef } from "react";
import { messageTime } from "./helpers";

type ThreadMessage = RouterOutputs["whatsapp"]["getThread"]["messages"][number];

interface MessageThreadProps {
	messages: ThreadMessage[];
	isLoading: boolean;
}

export function MessageThread({ messages, isLoading }: MessageThreadProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastMessageId = messages.at(-1)?.id;

	// Auto-scroll to the newest message whenever the tail changes.
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
	const body = message.body ?? `[${message.type}]`;

	return (
		<div
			className={cn("group flex flex-col", isOutbound ? "items-end" : "items-start")}
		>
			<div
				className={cn(
					"max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]",
					isOutbound
						? "rounded-br-sm bg-primary text-primary-foreground"
						: "rounded-bl-sm border bg-card text-foreground",
				)}
			>
				{body}
			</div>
			<span className="mt-0.5 px-1 text-[10px] text-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
				{messageTime(message.timestamp)}
			</span>
		</div>
	);
}
