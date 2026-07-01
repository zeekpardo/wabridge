"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpIcon, ClockIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MessageType, guessMimetype } from "./helpers";

const SPINTAX_SNIPPET = "!/SPINTAX_A/option one/option two/SPINTAX_A/! ${SPINTAX_A}";
const DELAY_SNIPPET = " !/DELAY/1000/4000/!";

const TYPE_OPTIONS: { value: MessageType; label: string }[] = [
	{ value: "text", label: "Text" },
	{ value: "image", label: "Image" },
	{ value: "video", label: "Video" },
	{ value: "audio", label: "Audio" },
	{ value: "document", label: "Document" },
];

interface ComposerProps {
	chatId: string;
	fromSessionId: string | null;
	onSent: () => void;
}

export function Composer({ chatId, fromSessionId, onSent }: ComposerProps) {
	const [type, setType] = useState<MessageType>("text");
	const [text, setText] = useState("");
	const [mediaUrl, setMediaUrl] = useState("");
	const [filename, setFilename] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const preview = useMutation(orpc.whatsapp.previewCommand.mutationOptions());

	const send = useMutation(
		orpc.whatsapp.sendMessage.mutationOptions({
			onSuccess: () => {
				setText("");
				setMediaUrl("");
				setFilename("");
				preview.reset();
				onSent();
			},
			onError: (error) => toastError(error.message ?? "Send failed"),
		}),
	);

	const isMedia = type !== "text";
	const attachments =
		isMedia && mediaUrl.trim()
			? [
					{
						url: mediaUrl.trim(),
						mimetype: guessMimetype(mediaUrl.trim(), type),
						filename: filename.trim() || undefined,
					},
				]
			: undefined;

	const canSend = text.trim().length > 0 || (attachments?.length ?? 0) > 0;

	// Debounced live preview after typing stops.
	const previewMutate = preview.mutate;
	useEffect(() => {
		if (text.trim().length === 0) {
			return;
		}
		const handle = setTimeout(() => {
			previewMutate({ text, attachments });
		}, 500);
		return () => clearTimeout(handle);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [text, mediaUrl, filename, type]);

	function insertSpintax() {
		const el = textareaRef.current;
		if (!el) {
			setText((value) => value + SPINTAX_SNIPPET);
			return;
		}
		const start = el.selectionStart;
		const end = el.selectionEnd;
		setText((value) => value.slice(0, start) + SPINTAX_SNIPPET + value.slice(end));
	}

	function insertDelay() {
		setText((value) => value + DELAY_SNIPPET);
	}

	function runSend() {
		if (!canSend) {
			return;
		}
		send.mutate({ chatId, text, attachments, fromSessionId: fromSessionId ?? undefined });
	}

	const showPreview = preview.data && text.trim().length > 0;

	return (
		<div className="flex flex-col gap-2 border-t bg-card/40 p-3">
			{isMedia && (
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						placeholder="Media URL (https://…)"
						value={mediaUrl}
						onChange={(e) => setMediaUrl(e.target.value)}
					/>
					<Input
						placeholder={type === "document" ? "Filename (optional)" : "Caption (optional)"}
						value={filename}
						onChange={(e) => setFilename(e.target.value)}
					/>
				</div>
			)}

			{showPreview && (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
					<span className="shrink-0 font-medium text-foreground/50">Preview</span>
					<span className="min-w-0 flex-1 truncate">
						{preview.data?.actions.map((a) => a.text ?? `[${a.kind}]`).join("  ") || "—"}
					</span>
					{preview.data?.meta.delayMs ? (
						<span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
							delay {preview.data.meta.delayMs}ms
						</span>
					) : null}
					{preview.data?.meta.unresolvedSpintax && (
						<span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">
							⚠ removed {preview.data.meta.unresolvedSpintax.join(", ")}
						</span>
					)}
				</div>
			)}

			<div className="rounded-2xl border bg-card focus-within:ring-1 focus-within:ring-primary">
				<Textarea
					ref={textareaRef}
					rows={1}
					className="min-h-11 resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0"
					placeholder={
						isMedia
							? "Optional caption. Commands are supported."
							: "Type a message…  (Enter to send, Shift+Enter for newline)"
					}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							runSend();
						}
					}}
				/>
				<div className="flex items-center justify-between gap-2 px-2 pb-2">
					<div className="flex items-center gap-0.5">
						<Select value={type} onValueChange={(value) => setType(value as MessageType)}>
							<SelectTrigger className="h-8 w-[6.5rem] border-0 text-xs shadow-none">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TYPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 gap-1 px-2 text-foreground/60 text-xs"
							onClick={insertSpintax}
						>
							<ShuffleIcon className="size-3.5" />
							Spintax
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-8 gap-1 px-2 text-foreground/60 text-xs"
							onClick={insertDelay}
						>
							<ClockIcon className="size-3.5" />
							Delay
						</Button>
					</div>
					<Button
						type="button"
						size="icon"
						className="size-8 rounded-full"
						disabled={!canSend}
						loading={send.isPending}
						onClick={runSend}
						aria-label="Send"
					>
						<ArrowUpIcon className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
