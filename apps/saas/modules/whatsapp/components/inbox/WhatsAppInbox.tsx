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
import { ChevronLeftIcon, MessageSquareIcon, PanelRightIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Composer } from "./Composer";
import { ContactDetailsPanel } from "./ContactDetailsPanel";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationList } from "./ConversationList";
import { prettyPhone } from "./helpers";
import { MessageThread } from "./MessageThread";

export function WhatsAppInbox({
	embedded = false,
	subaccountId,
}: {
	embedded?: boolean;
	subaccountId?: string;
}) {
	const queryClient = useQueryClient();
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
	// Contact details default open on desktop; on mobile the aside is a full
	// overlay, so it stays opt-in there.
	const [detailsOpen, setDetailsOpen] = useState(
		() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
	);

	// Conversation-list filters (owner / tag). Cleared = no filter.
	const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
	const [tagFilter, setTagFilter] = useState<{ tag: string; mode: "has" | "not" } | null>(null);

	// Full chat list pulled from OpenWA (all contacts), overlaid with our tracked
	// conversation state. Heavier than the DB-only list, so polled less often.
	const conversationsQuery = useQuery({
		...orpc.whatsapp.listChats.queryOptions({
			input: {
				subaccountId,
				...(ownerFilter ? { ownerId: ownerFilter } : {}),
				...(tagFilter ? { tag: tagFilter.tag, tagMode: tagFilter.mode } : {}),
			},
		}),
		refetchInterval: 15000,
	});

	const numbersQuery = useQuery(
		orpc.whatsapp.listNumbers.queryOptions({ input: { subaccountId } }),
	);

	const threadQuery = useQuery({
		...orpc.whatsapp.getThread.queryOptions({
			input: { chatId: selectedChatId ?? "", limit: 100, subaccountId },
		}),
		enabled: !!selectedChatId,
		refetchInterval: selectedChatId ? 4000 : false,
	});

	// Real WhatsApp history for the chat (live from OpenWA). Fetched once per open
	// — not polled — so past conversations show even for never-messaged contacts.
	const historyQuery = useQuery({
		...orpc.whatsapp.getChatHistory.queryOptions({
			input: { chatId: selectedChatId ?? "", limit: 50, subaccountId },
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
				status?: string | null;
				sessionId?: string | null;
				sentByName?: string | null;
				media?: { kind: string; dataUrl: string | null; mimetype?: string | null } | null;
			}
		>();
		// Our DB rows carry status + the sending/receiving session (which number).
		for (const m of threadQuery.data?.messages ?? []) {
			byKey.set(m.waMessageId ?? m.id, {
				id: m.id,
				direction: m.direction,
				body: m.body,
				type: m.type,
				timestamp: m.timestamp,
				status: m.status,
				sessionId: m.sessionId,
				sentByName: m.sentByName,
				media: null,
			});
		}
		// OpenWA history carries media thumbnails — merge it in without dropping
		// the DB row's status/sessionId; history-only rows keep those undefined.
		for (const m of historyQuery.data ?? []) {
			const key = m.waMessageId ?? m.id;
			const existing = byKey.get(key);
			if (existing) {
				existing.media = m.media;
			} else {
				byKey.set(key, {
					id: m.id,
					direction: m.direction,
					body: m.body,
					type: m.type,
					timestamp: m.timestamp,
					status: m.status,
					media: m.media,
				});
			}
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
	// The contact's actual sticky primary (persisted), not the display fallback —
	// marked with a star in the switcher. Null until a first message sets it.
	const primaryNumberId = conversation?.activeSessionId ?? selectedChat?.activeSession?.id ?? null;
	const contactName =
		selectedChat?.contactName ||
		conversation?.contactName ||
		selectedChat?.phone ||
		(selectedChatId ? prettyPhone(selectedChatId) : "");

	return (
		<Card
			className={cn(
				"p-0 relative flex overflow-hidden",
				embedded
					? "h-full rounded-none border-0 shadow-none"
					: "h-[calc(100vh-16rem)] min-h-[32rem]",
			)}
		>
			<div
				className={cn(
					"md:w-1/4 md:min-w-56 w-full shrink-0 border-r",
					selectedChatId ? "md:block hidden" : "block",
				)}
			>
				<ConversationList
					conversations={conversations}
					isLoading={conversationsQuery.isLoading}
					selectedChatId={selectedChatId}
					onSelect={setSelectedChatId}
					filters={
						<ConversationFilters
							subaccountId={subaccountId}
							ownerFilter={ownerFilter}
							onOwnerChange={setOwnerFilter}
							tagFilter={tagFilter}
							onTagChange={setTagFilter}
						/>
					}
				/>
			</div>

			<div className={cn("flex-1 flex-col", selectedChatId ? "flex" : "md:flex hidden")}>
				{!selectedChatId ? (
					<div className="gap-2 flex flex-1 flex-col items-center justify-center text-center">
						<div className="size-12 flex items-center justify-center rounded-full bg-primary/10">
							<MessageSquareIcon className="size-6 text-primary" />
						</div>
						<p className="font-medium">Select a conversation</p>
						<p className="text-sm text-foreground/75">
							Pick a chat on the left, or start a new one.
						</p>
					</div>
				) : (
					<>
						<div className="gap-3 p-3 flex items-center justify-between border-b">
							<div className="min-w-0 gap-1 flex items-center">
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
									<p className="font-medium text-sm truncate">{contactName}</p>
									{selectedChat?.phone && selectedChat.phone !== contactName ? (
										<p className="text-xs truncate text-foreground/65">{selectedChat.phone}</p>
									) : null}
								</div>
							</div>
							<div className="gap-2 flex items-center">
								<span
									className="text-xs sm:inline hidden text-foreground/75"
									title="Sets this contact's primary number — future messages send from it."
								>
									Send from
								</span>
								<Select
									value={activeNumberId}
									disabled={numbers.length === 0 || setNumber.isPending}
									onValueChange={(sessionId) =>
										setNumber.mutate({ chatId: selectedChatId, sessionId, subaccountId })
									}
								>
									<SelectTrigger
										className="w-36 sm:w-44"
										aria-label="Contact's primary number"
										title="Sets this contact's primary number — future messages send from it."
									>
										<SelectValue placeholder="No numbers" />
									</SelectTrigger>
									<SelectContent>
										{numbers.map((number) => (
											<SelectItem key={number.id} value={number.id}>
												<span className="gap-1.5 flex items-center">
													{number.label || number.phone || "Unnamed number"}
													{number.id === primaryNumberId ? (
														<StarIcon
															className="size-3 fill-amber-400 text-amber-400"
															aria-label="Primary number"
														/>
													) : null}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant={detailsOpen ? "secondary" : "ghost"}
									size="icon"
									aria-label="Toggle contact details"
									onClick={() => setDetailsOpen((open) => !open)}
								>
									<PanelRightIcon className="size-4" />
								</Button>
							</div>
						</div>

						<MessageThread
							messages={threadMessages}
							isLoading={threadQuery.isLoading || historyQuery.isLoading}
							contact={{
								name: contactName,
								phone: selectedChat?.phone ?? (selectedChatId ? prettyPhone(selectedChatId) : null),
							}}
							numbers={numbers}
							fallbackNumberId={activeNumberId || null}
						/>

						<Composer
							chatId={selectedChatId}
							fromSessionId={activeNumberId || null}
							subaccountId={subaccountId}
							onSent={invalidateInbox}
						/>
					</>
				)}
			</div>

			{selectedChatId && detailsOpen ? (
				<aside className="inset-0 md:static md:z-auto md:w-80 md:shrink-0 lg:w-96 absolute z-10 border-l bg-card">
					<ContactDetailsPanel
						chatId={selectedChatId}
						subaccountId={subaccountId}
						onClose={() => setDetailsOpen(false)}
					/>
				</aside>
			) : null}
		</Card>
	);
}
