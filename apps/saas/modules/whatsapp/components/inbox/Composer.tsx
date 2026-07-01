"use client";

import { Badge } from "@repo/ui/components/badge";
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
import { SendIcon } from "lucide-react";
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
	const attachments = isMedia && mediaUrl.trim()
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
		send.mutate({
			chatId,
			text,
			attachments,
			fromSessionId: fromSessionId ?? undefined,
		});
	}

	return (
		<div className="flex flex-col gap-2 border-t p-3">
			<div className="flex items-center gap-2">
				<Select value={type} onValueChange={(value) => setType(value as MessageType)}>
					<SelectTrigger className="w-32">
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
				<div className="flex gap-1.5">
					<Button variant="outline" size="sm" onClick={insertSpintax}>
						+ Spintax
					</Button>
					<Button variant="outline" size="sm" onClick={insertDelay}>
						+ Delay
					</Button>
				</div>
			</div>

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

			<Textarea
				ref={textareaRef}
				rows={3}
				className="font-mono text-sm"
				placeholder={
					isMedia
						? "Optional caption. Commands are supported."
						: "Type a message. Commands are supported, e.g. !/SPINTAX_A/Hi/Hey/SPINTAX_A/! ${SPINTAX_A}"
				}
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>

			{preview.data && text.trim().length > 0 && (
				<div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-2.5">
					<p className="font-medium text-foreground/60 text-xs uppercase tracking-wide">
						Resolves to {preview.data.actions.length} action
						{preview.data.actions.length === 1 ? "" : "s"}
						{preview.data.meta.spintaxApplied ? " · spintax applied" : ""}
					</p>
					{preview.data.meta.unresolvedSpintax && (
						<p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-600 text-xs">
							⚠️ Undefined spintax removed: {preview.data.meta.unresolvedSpintax.join(", ")}
						</p>
					)}
					{preview.data.actions.map((action, i) => (
						<div key={i} className="flex items-start gap-2 text-sm">
							<Badge status="info">{action.kind}</Badge>
							<div className="min-w-0 flex-1">
								{action.url && (
									<p className="truncate text-foreground/60 text-xs">{action.url}</p>
								)}
								{action.text && <p className="whitespace-pre-wrap">{action.text}</p>}
								{action.delayMs ? (
									<p className="text-amber-600 text-xs">delay {action.delayMs} ms</p>
								) : null}
							</div>
						</div>
					))}
				</div>
			)}

			<div className="flex justify-end">
				<Button disabled={!canSend} loading={send.isPending} onClick={runSend}>
					<SendIcon className="mr-1.5 size-4" />
					Send
				</Button>
			</div>
		</div>
	);
}
