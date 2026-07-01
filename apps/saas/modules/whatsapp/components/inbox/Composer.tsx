"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toastError } from "@repo/ui/components/toast";
import { buildCommandString, type MessageSegment } from "@repo/whatsapp/commands";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpIcon, ClockIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChipEditor, type ChipEditorHandle } from "./ChipEditor";
import { type MessageType, guessMimetype } from "./helpers";

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

function hasSendableContent(segments: MessageSegment[]): boolean {
	return segments.some(
		(segment) =>
			(segment.type === "text" && segment.value.trim().length > 0) || segment.type === "spintax",
	);
}

export function Composer({ chatId, fromSessionId, onSent }: ComposerProps) {
	const editorRef = useRef<ChipEditorHandle>(null);
	const [type, setType] = useState<MessageType>("text");
	const [mediaUrl, setMediaUrl] = useState("");
	const [filename, setFilename] = useState("");
	const [segments, setSegments] = useState<MessageSegment[]>([]);

	const [spintaxOpen, setSpintaxOpen] = useState(false);
	const [spintaxInput, setSpintaxInput] = useState("");
	const [delayOpen, setDelayOpen] = useState(false);
	const [delayMin, setDelayMin] = useState("1");
	const [delayMax, setDelayMax] = useState("4");

	const preview = useMutation(orpc.whatsapp.previewCommand.mutationOptions());

	const send = useMutation(
		orpc.whatsapp.sendMessage.mutationOptions({
			onSuccess: () => {
				editorRef.current?.clear();
				setSegments([]);
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

	const canSend = hasSendableContent(segments) || (attachments?.length ?? 0) > 0;

	// Debounced live preview whenever the message or media changes.
	const previewMutate = preview.mutate;
	useEffect(() => {
		const raw = buildCommandString(segments);
		if (raw.trim().length === 0 && !attachments) {
			preview.reset();
			return;
		}
		const handle = setTimeout(() => {
			previewMutate({ text: raw, attachments });
		}, 400);
		return () => clearTimeout(handle);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [segments, mediaUrl, filename, type]);

	function addSpintax() {
		const options = spintaxInput
			.split(",")
			.map((option) => option.trim())
			.filter(Boolean);
		if (options.length > 0) {
			editorRef.current?.insertSpintax(options);
		}
		setSpintaxInput("");
		setSpintaxOpen(false);
	}

	function addDelay() {
		const min = Math.round(Number.parseFloat(delayMin) * 1000);
		const max = Math.round(Number.parseFloat(delayMax) * 1000);
		if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= 0) {
			editorRef.current?.insertDelay(Math.min(min, max), Math.max(min, max));
		}
		setDelayOpen(false);
	}

	function runSend() {
		if (!canSend) {
			return;
		}
		const raw = buildCommandString(editorRef.current?.getSegments() ?? segments);
		send.mutate({ chatId, text: raw, attachments, fromSessionId: fromSessionId ?? undefined });
	}

	const showPreview = preview.data && canSend;

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
				</div>
			)}

			<div className="rounded-2xl border bg-card focus-within:ring-1 focus-within:ring-primary">
				<ChipEditor
					ref={editorRef}
					placeholder={
						isMedia ? "Optional caption…" : "Type a message, or add a variable / delay chip…"
					}
					onChange={setSegments}
					onEnter={runSend}
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

						<Popover open={spintaxOpen} onOpenChange={setSpintaxOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-foreground/60 text-xs"
								>
									<ShuffleIcon className="size-3.5" />
									Variable
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-72">
								<div className="flex flex-col gap-2">
									<Label className="text-xs">Options (comma-separated)</Label>
									<Input
										// oxlint-disable-next-line no-autofocus
										autoFocus
										placeholder="Hello, Hey there, Hi friend"
										value={spintaxInput}
										onChange={(e) => setSpintaxInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												addSpintax();
											}
										}}
									/>
									<p className="text-foreground/50 text-xs">
										Each recipient gets a random option — reduces spam flags.
									</p>
									<Button size="sm" onClick={addSpintax}>
										Add variable
									</Button>
								</div>
							</PopoverContent>
						</Popover>

						<Popover open={delayOpen} onOpenChange={setDelayOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-foreground/60 text-xs"
								>
									<ClockIcon className="size-3.5" />
									Delay
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64">
								<div className="flex flex-col gap-2">
									<Label className="text-xs">Random delay (seconds)</Label>
									<div className="flex items-center gap-2">
										<Input
											type="number"
											min={0}
											step="0.5"
											value={delayMin}
											onChange={(e) => setDelayMin(e.target.value)}
										/>
										<span className="text-foreground/50 text-xs">to</span>
										<Input
											type="number"
											min={0}
											step="0.5"
											value={delayMax}
											onChange={(e) => setDelayMax(e.target.value)}
										/>
									</div>
									<p className="text-foreground/50 text-xs">
										Waits a random time in this range before sending.
									</p>
									<Button size="sm" onClick={addDelay}>
										Add delay
									</Button>
								</div>
							</PopoverContent>
						</Popover>
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
