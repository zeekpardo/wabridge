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
import {
	ChevronLeftIcon,
	MessageSquareIcon,
	PanelRightIcon,
	StarIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Composer } from "./Composer";
import { ContactDetailsPanel } from "./ContactDetailsPanel";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationList } from "./ConversationList";
import { ForwardDialog, type ForwardTarget } from "./ForwardDialog";
import { prettyPhone } from "./helpers";
import { MessageThread } from "./MessageThread";

/**
 * Coerce the stored `reactions` JSON into the shared UI shape. The column is
 * `Json?`, so we defensively read whatever the gateway persisted and drop
 * anything malformed rather than trusting the type.
 */
function normalizeReactions(
	value: unknown,
): Array<{ emoji: string; senderId: string; fromMe: boolean }> | null {
	if (!Array.isArray(value)) {
		return null;
	}
	const out: Array<{ emoji: string; senderId: string; fromMe: boolean }> = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const r = entry as Record<string, unknown>;
		const emoji =
			typeof r.emoji === "string" ? r.emoji : typeof r.reaction === "string" ? r.reaction : null;
		if (!emoji) {
			continue;
		}
		out.push({
			emoji,
			senderId: typeof r.senderId === "string" ? r.senderId : "",
			fromMe: r.fromMe === true,
		});
	}
	return out.length > 0 ? out : null;
}

export function WhatsAppInbox({
	embedded = false,
	subaccountId,
	onManageGroup,
}: {
	embedded?: boolean;
	subaccountId?: string;
	/** Called with the group chatId when the user opens group management from a group thread. */
	onManageGroup?: (chatId: string) => void;
}) {
	const queryClient = useQueryClient();
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
	// The message being replied to (drives the Composer's reply preview). Cleared
	// on send/cancel and whenever the open conversation changes.
	const [replyingTo, setReplyingTo] = useState<{
		id: string;
		waMessageId: string | null;
		body: string | null;
		senderName: string;
	} | null>(null);
	// The message being forwarded (opens the target picker). Cleared on pick/close.
	const [forwarding, setForwarding] = useState<{ messageId: string; body: string | null } | null>(
		null,
	);
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
				authorName?: string | null;
				media?: { kind: string; dataUrl: string | null; mimetype?: string | null } | null;
				waMessageId?: string | null;
				quotedMessageId?: string | null;
				reactions?: Array<{ emoji: string; senderId: string; fromMe: boolean }> | null;
				deleted?: boolean | null;
			}
		>();
		// Our DB rows carry status + the sending/receiving session (which number),
		// plus the reply/reaction/delete metadata (schema fields on WhatsAppMessage).
		for (const m of threadQuery.data?.messages ?? []) {
			// New schema fields land on the row once the migration ships; read them
			// optional-safe so this compiles before/after that lands.
			const row = m as typeof m & {
				quotedMessageId?: string | null;
				reactions?: unknown;
				deleted?: boolean | null;
				authorName?: string | null;
			};
			byKey.set(m.waMessageId ?? m.id, {
				id: m.id,
				direction: m.direction,
				body: m.body,
				type: m.type,
				timestamp: m.timestamp,
				status: m.status,
				sessionId: m.sessionId,
				sentByName: m.sentByName,
				authorName: row.authorName ?? null,
				media: null,
				waMessageId: m.waMessageId,
				quotedMessageId: row.quotedMessageId ?? null,
				reactions: normalizeReactions(row.reactions),
				deleted: row.deleted ?? null,
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
					waMessageId: m.waMessageId,
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

	// Explicitly set the contact's PRIMARY number (the `wa:` tag). Separate from the transient
	// "Send from" pick above — refresh the profile so the star indicator moves.
	const setPrimary = useMutation(
		orpc.whatsapp.setPrimaryNumber.mutationOptions({
			onSuccess: () => {
				invalidateInbox();
				void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getContactProfile.key() });
			},
		}),
	);

	// Message actions. Reply/react/delete change stored state, so they invalidate
	// the inbox; forward/typing don't touch the open thread.
	const replyMutation = useMutation(
		orpc.whatsapp.replyMessage.mutationOptions({ onSuccess: () => invalidateInbox() }),
	);
	const reactMutation = useMutation(
		orpc.whatsapp.reactMessage.mutationOptions({ onSuccess: () => invalidateInbox() }),
	);
	const forwardMutation = useMutation(orpc.whatsapp.forwardMessage.mutationOptions());
	const deleteMutation = useMutation(
		orpc.whatsapp.deleteMessage.mutationOptions({ onSuccess: () => invalidateInbox() }),
	);
	const markReadMutation = useMutation(
		orpc.whatsapp.markChatRead.mutationOptions({ onSuccess: () => invalidateInbox() }),
	);
	const markUnreadMutation = useMutation(
		orpc.whatsapp.markChatUnread.mutationOptions({ onSuccess: () => invalidateInbox() }),
	);
	const setTypingMutation = useMutation(orpc.whatsapp.setTyping.mutationOptions());

	// Contact avatar for the thread — reuse the CRM profile query (best-effort;
	// undefined until it resolves or if it fails).
	const contactProfileQuery = useQuery({
		...orpc.whatsapp.getContactProfile.queryOptions({
			input: { chatId: selectedChatId ?? "", subaccountId },
		}),
		enabled: !!selectedChatId,
		staleTime: 60_000,
	});

	// Mark the thread read once per opened conversation (sends blue ticks). Guarded
	// by a ref so the mutation fires a single time even as queries refetch.
	const readChatRef = useRef<string | null>(null);
	if (selectedChatId && readChatRef.current !== selectedChatId) {
		readChatRef.current = selectedChatId;
		setReplyingTo(null);
		markReadMutation.mutate({ chatId: selectedChatId, subaccountId });
	}

	// Debounced typing indicator — coalesces rapid keystrokes into one gateway
	// call every ~1.5s while the user is typing.
	const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	function handleTyping() {
		if (!selectedChatId || typingTimerRef.current) {
			return;
		}
		setTypingMutation.mutate({ chatId: selectedChatId, state: "typing", subaccountId });
		typingTimerRef.current = setTimeout(() => {
			typingTimerRef.current = null;
		}, 1500);
	}

	const conversations = conversationsQuery.data ?? [];
	const numbers = numbersQuery.data ?? [];
	const conversation = threadQuery.data?.conversation;

	const selectedChat = conversations.find((chat) => chat.chatId === selectedChatId);
	const activeNumberId =
		conversation?.activeSessionId ?? selectedChat?.activeSession?.id ?? numbers[0]?.id ?? "";
	// The contact's actual sticky primary number = the `wa:<digits>` tag on the CRM contact, matched
	// back to one of our numbers. This is DISTINCT from the send-from (activeSessionId): switching
	// "Send from" no longer changes it; only the explicit "Set as primary" does. Null until set.
	const primaryPhoneDigits =
		(contactProfileQuery.data?.tags ?? [])
			.find((tag) => /^wa:/i.test(tag))
			?.slice(3)
			.replace(/\D/g, "") || null;
	const primaryNumberId = primaryPhoneDigits
		? (numbers.find((number) => (number.phone ?? "").replace(/\D/g, "") === primaryPhoneDigits)
				?.id ?? null)
		: null;
	const contactName =
		selectedChat?.contactName ||
		conversation?.contactName ||
		selectedChat?.phone ||
		(selectedChatId ? prettyPhone(selectedChatId) : "");

	// A group thread is either flagged by the chat list or detectable from the id.
	const isGroupChat =
		Boolean(selectedChat?.isGroup) || (selectedChatId?.endsWith("@g.us") ?? false);

	// Best-effort member count for the group header, resolved via the group's
	// member session (the active number). Stays null until it loads or if it fails.
	const groupInfoQuery = useQuery({
		...orpc.whatsapp.getGroup.queryOptions({
			input: { sessionId: activeNumberId, groupId: selectedChatId ?? "", subaccountId },
		}),
		enabled: isGroupChat && !!selectedChatId && !!activeNumberId,
		staleTime: 60_000,
	});
	const memberCount = groupInfoQuery.data?.participants?.length ?? null;

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
					onMarkUnread={(chatId) => markUnreadMutation.mutate({ chatId, subaccountId })}
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
									{isGroupChat ? (
										memberCount !== null ? (
											<p className="text-xs truncate text-foreground/65">
												{memberCount} {memberCount === 1 ? "member" : "members"}
											</p>
										) : null
									) : selectedChat?.phone && selectedChat.phone !== contactName ? (
										<p className="text-xs truncate text-foreground/65">{selectedChat.phone}</p>
									) : null}
								</div>
							</div>
							<div className="gap-2 flex items-center">
								<span
									className="text-xs sm:inline hidden text-foreground/75"
									title="Which number this reply sends from. Transient — it does NOT change the contact's primary number."
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
										aria-label="Send-from number"
										title="Which number this reply sends from. Transient — it does NOT change the contact's primary number."
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
								{selectedChatId && activeNumberId && activeNumberId !== primaryNumberId ? (
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5"
										disabled={setPrimary.isPending}
										aria-label="Set as primary number"
										title="Make the selected number this contact's primary — the number we default to sending from."
										onClick={() =>
											setPrimary.mutate({
												chatId: selectedChatId,
												sessionId: activeNumberId,
												subaccountId,
											})
										}
									>
										<StarIcon className="size-3.5" />
										<span className="sm:inline hidden">Set as primary</span>
									</Button>
								) : null}
								{isGroupChat && onManageGroup ? (
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5"
										aria-label="Manage group"
										onClick={() => onManageGroup(selectedChatId)}
									>
										<UsersIcon className="size-4" />
										<span className="sm:inline hidden">Manage</span>
									</Button>
								) : null}
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
								avatarUrl: contactProfileQuery.data?.avatarUrl ?? undefined,
								isGroup: isGroupChat,
								memberCount,
							}}
							numbers={numbers}
							fallbackNumberId={activeNumberId || null}
							onReply={(message) =>
								setReplyingTo({
									id: message.id,
									waMessageId: message.waMessageId ?? null,
									body: message.body,
									senderName:
										message.direction === "outbound"
											? message.sentByName?.trim() || "You"
											: contactName,
								})
							}
							onReact={(message, emoji) => {
								const messageId = message.waMessageId ?? message.id;
								reactMutation.mutate({ chatId: selectedChatId, messageId, emoji, subaccountId });
							}}
							onForward={(message) => {
								// Open the target picker (a contact or a team member).
								setForwarding({ messageId: message.waMessageId ?? message.id, body: message.body });
							}}
							onDelete={(message) => {
								const messageId = message.waMessageId ?? message.id;
								deleteMutation.mutate({
									chatId: selectedChatId,
									messageId,
									forEveryone: true,
									subaccountId,
								});
							}}
						/>

						<Composer
							chatId={selectedChatId}
							fromSessionId={activeNumberId || null}
							subaccountId={subaccountId}
							onSent={invalidateInbox}
							replyingTo={
								replyingTo
									? {
											id: replyingTo.id,
											waMessageId: replyingTo.waMessageId,
											body: replyingTo.body,
											senderName: replyingTo.senderName,
										}
									: null
							}
							onCancelReply={() => setReplyingTo(null)}
							onReply={(text) => {
								const quotedMessageId = replyingTo?.waMessageId ?? replyingTo?.id;
								if (!quotedMessageId) {
									return;
								}
								replyMutation.mutate(
									{ chatId: selectedChatId, quotedMessageId, text, subaccountId },
									{ onSuccess: () => setReplyingTo(null) },
								);
							}}
							onTyping={handleTyping}
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

			<ForwardDialog
				open={forwarding !== null}
				onOpenChange={(next) => {
					if (!next) {
						setForwarding(null);
					}
				}}
				subaccountId={subaccountId}
				contacts={conversations}
				fromChatId={selectedChatId}
				onSelect={(target: ForwardTarget) => {
					if (!forwarding || !selectedChatId) {
						return;
					}
					forwardMutation.mutate({
						fromChatId: selectedChatId,
						messageId: forwarding.messageId,
						body: forwarding.body ?? undefined,
						...target,
						subaccountId,
					});
					setForwarding(null);
				}}
			/>
		</Card>
	);
}
