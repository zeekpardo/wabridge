"use client";

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
import { MessageSquareIcon } from "lucide-react";
import { useState } from "react";
import { Composer } from "./Composer";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { prettyPhone } from "./helpers";

export function WhatsAppInbox() {
	const queryClient = useQueryClient();
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

	const conversationsQuery = useQuery({
		...orpc.whatsapp.listConversations.queryOptions(),
		refetchInterval: 5000,
	});

	const numbersQuery = useQuery(orpc.whatsapp.listNumbers.queryOptions());

	const threadQuery = useQuery({
		...orpc.whatsapp.getThread.queryOptions({
			input: { chatId: selectedChatId ?? "", limit: 100 },
		}),
		enabled: !!selectedChatId,
		refetchInterval: selectedChatId ? 4000 : false,
	});

	function invalidateInbox() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listConversations.key() });
		if (selectedChatId) {
			void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getThread.key() });
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

	const activeNumberId = conversation?.activeSessionId ?? numbers[0]?.id ?? "";
	const contactName = conversation?.contactName
		|| (selectedChatId ? prettyPhone(selectedChatId) : "");

	return (
		<Card className="flex h-[calc(100vh-16rem)] min-h-[32rem] overflow-hidden p-0">
			<div className="w-72 shrink-0 border-r">
				<ConversationList
					conversations={conversations}
					isLoading={conversationsQuery.isLoading}
					selectedChatId={selectedChatId}
					onSelect={setSelectedChatId}
				/>
			</div>

			<div className="flex flex-1 flex-col">
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
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">{contactName}</p>
								<p className="truncate text-foreground/50 text-xs">
									{prettyPhone(selectedChatId)}
								</p>
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
							messages={threadQuery.data?.messages ?? []}
							isLoading={threadQuery.isLoading}
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
