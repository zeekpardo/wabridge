"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, MessageSquareIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Composer } from "./Composer";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { prettyPhone } from "./helpers";

export function WhatsAppInbox({ embedded = false }: { embedded?: boolean }) {
	const queryClient = useQueryClient();
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

	// Full chat list pulled from OpenWA (all contacts), overlaid with our tracked
	// conversation state. Heavier than the DB-only list, so polled less often.
	const conversationsQuery = useQuery({
		...orpc.whatsapp.listChats.queryOptions(),
		refetchInterval: 15000,
	});

	const numbersQuery = useQuery(orpc.whatsapp.listNumbers.queryOptions());

	const threadQuery = useQuery({
		...orpc.whatsapp.getThread.queryOptions({
			input: { chatId: selectedChatId ?? "", limit: 100 },
		}),
		enabled: !!selectedChatId,
		refetchInterval: selectedChatId ? 4000 : false,
	});

	// Real WhatsApp history for the chat (live from OpenWA). Fetched once per open
	// — not polled — so past conversations show even for never-messaged contacts.
	const historyQuery = useQuery({
		...orpc.whatsapp.getChatHistory.queryOptions({
			input: { chatId: selectedChatId ?? "", limit: 50 },
		}),
		enabled: !!selectedChatId,
		staleTime: 60_000,
	});

	// Merge OpenWA history with our tracked/live messages, deduped by WhatsApp id.
	// Our DB rows go first; the OpenWA history (which carries media thumbnails) wins
	// for messages present in both. Brand-new sends live only in the DB until the
	// next history refresh.
	const threadMessages = useMemo(() => {
		const byKey = new Map<
			string,
			{
				id: string;
				direction: string;
				body: string | null;
				type: string;
				timestamp: Date | string;
				media?: { kind: string; dataUrl: string | null } | null;
			}
		>();
		for (const m of threadQuery.data?.messages ?? []) {
			byKey.set(m.waMessageId ?? m.id, {
				id: m.id,
				direction: m.direction,
				body: m.body,
				type: m.type,
				timestamp: m.timestamp,
				media: null,
			});
		}
		for (const m of historyQuery.data ?? []) {
			byKey.set(m.waMessageId ?? m.id, {
				id: m.id,
				direction: m.direction,
				body: m.body,
				type: m.type,
				timestamp: m.timestamp,
				media: m.media,
			});
		}
		return [...byKey.values()].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}, [historyQuery.data, threadQuery.data]);

	function invalidateInbox() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listChats.key() });
		if (selectedChatId) {
			void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getThread.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getChatHistory.key() });
		}
	}

	const setNumber = useMutation(
		orpc.whatsapp.setConversationNumber.mutationOptions({
			onSuccess: () => invalidateInbox(),
		}),
	);

	const conversations = conversationsQuery.data ?? [];
	const numbers = numbersQuery.data ?? [];
	const conversation = threadQuery.data?.conversation;

	const selectedChat = conversations.find((chat) => chat.chatId === selectedChatId);
	const activeNumberId =
		conversation?.activeSessionId ?? selectedChat?.activeSession?.id ?? numbers[0]?.id ?? "";
	const contactName =
		selectedChat?.contactName ||
		conversation?.contactName ||
		selectedChat?.phone ||
		(selectedChatId ? prettyPhone(selectedChatId) : "");

	return (
		<Card
			className={cn(
				"flex overflow-hidden p-0",
				embedded
					? "h-[100dvh] rounded-none border-0 shadow-none"
					: "h-[calc(100vh-16rem)] min-h-[32rem]",
			)}
		>
			<div
				className={cn(
					"w-full shrink-0 border-r md:w-1/4 md:min-w-56",
					selectedChatId ? "hidden md:block" : "block",
				)}
			>
				<ConversationList
					conversations={conversations}
					isLoading={conversationsQuery.isLoading}
					selectedChatId={selectedChatId}
					onSelect={setSelectedChatId}
				/>
			</div>

			<div className={cn("flex-1 flex-col", selectedChatId ? "flex" : "hidden md:flex")}>
				{!selectedChatId ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
							<MessageSquareIcon className="size-6 text-primary" />
						</div>
						<p className="font-medium">Select a conversation</p>
						<p className="text-foreground/60 text-sm">
							Pick a chat on the left, or start a new one.
						</p>
					</div>
				) : (
					<>
						<div className="flex items-center justify-between gap-3 border-b p-3">
							<div className="flex min-w-0 items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="md:hidden"
									aria-label="Back to conversations"
									onClick={() => setSelectedChatId(null)}
								>
									<ChevronLeftIcon className="size-4" />
								</Button>
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">{contactName}</p>
									{selectedChat?.phone && selectedChat.phone !== contactName ? (
										<p className="truncate text-foreground/50 text-xs">{selectedChat.phone}</p>
									) : null}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-foreground/60 text-xs">Send from</span>
								<Select
									value={activeNumberId}
									disabled={numbers.length === 0 || setNumber.isPending}
									onValueChange={(sessionId) =>
										setNumber.mutate({ chatId: selectedChatId, sessionId })
									}
								>
									<SelectTrigger className="w-44">
										<SelectValue placeholder="No numbers" />
									</SelectTrigger>
									<SelectContent>
										{numbers.map((number) => (
											<SelectItem key={number.id} value={number.id}>
												{number.label || number.phone || "Unnamed number"}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<MessageThread
							messages={threadMessages}
							isLoading={threadQuery.isLoading || historyQuery.isLoading}
						/>

						<Composer
							chatId={selectedChatId}
							fromSessionId={activeNumberId || null}
							onSent={invalidateInbox}
						/>
					</>
				)}
			</div>
		</Card>
	);
}
