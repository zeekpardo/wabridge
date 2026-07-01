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
			<div className="flex flex-1 items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center px-4 text-center">
				<p className="text-foreground/50 text-sm">No messages in this conversation yet.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
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
		<div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
			<div
				className={cn(
					"max-w-[75%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
					isOutbound ? "bg-primary/15 text-foreground" : "bg-muted text-foreground",
				)}
			>
				{body}
			</div>
			<span className="mt-0.5 text-foreground/40 text-[10px]">
				{messageTime(message.timestamp)}
			</span>
		</div>
	);
}
