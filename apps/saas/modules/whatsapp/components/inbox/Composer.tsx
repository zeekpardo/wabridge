"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { toastError } from "@repo/ui/components/toast";
import { buildCommandString, type MessageSegment } from "@repo/whatsapp/commands";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import {
	ArrowUpIcon,
	ClockIcon,
	FileIcon,
	MicIcon,
	PaperclipIcon,
	ShuffleIcon,
	SmileIcon,
	SquareIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { ChipEditor, type ChipEditorHandle } from "./ChipEditor";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface StagedFile {
	id: string;
	name: string;
	mimetype: string;
	base64: string;
	previewUrl: string;
}

/** Pick the best voice-note container the browser can record. */
function pickAudioMime(): string {
	const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
	if (typeof MediaRecorder !== "undefined") {
		for (const type of candidates) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}
	}
	return "audio/webm";
}

interface ComposerProps {
	chatId: string;
	fromSessionId: string | null;
	subaccountId?: string;
	onSent: () => void;
}

function hasSendableContent(segments: MessageSegment[]): boolean {
	return segments.some(
		(segment) =>
			(segment.type === "text" && segment.value.trim().length > 0) || segment.type === "spintax",
	);
}

export function Composer({ chatId, fromSessionId, subaccountId, onSent }: ComposerProps) {
	const editorRef = useRef<ChipEditorHandle>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const [segments, setSegments] = useState<MessageSegment[]>([]);
	const [files, setFiles] = useState<StagedFile[]>([]);
	const [recording, setRecording] = useState(false);
	const [recordSeconds, setRecordSeconds] = useState(0);
	const [emojiOpen, setEmojiOpen] = useState(false);
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
				setFiles([]);
				preview.reset();
				onSent();
			},
			onError: (error) => toastError(error.message ?? "Send failed"),
		}),
	);

	const canSend = hasSendableContent(segments) || files.length > 0;

	// Debounced live preview of the text (files are shown separately).
	const previewMutate = preview.mutate;
	useEffect(() => {
		const raw = buildCommandString(segments);
		if (raw.trim().length === 0) {
			preview.reset();
			return;
		}
		const handle = setTimeout(() => previewMutate({ text: raw, subaccountId }), 400);
		return () => clearTimeout(handle);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [segments]);

	// Stop any in-flight recording timer when the composer unmounts.
	useEffect(() => stopTimer, []);

	function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const list = Array.from(event.target.files ?? []);
		for (const file of list) {
			if (file.size > 16 * 1024 * 1024) {
				toastError(`${file.name} is over 16 MB`);
				continue;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = String(reader.result);
				const base64 = dataUrl.split(",")[1] ?? "";
				setFiles((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						name: file.name,
						mimetype: file.type || "application/octet-stream",
						base64,
						previewUrl: dataUrl,
					},
				]);
			};
			reader.readAsDataURL(file);
		}
		event.target.value = "";
	}

	function stopTimer() {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}

	async function startRecording() {
		if (recording) {
			return;
		}
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			toastError("Microphone access was denied.");
			return;
		}
		const mimetype = pickAudioMime();
		const recorder = new MediaRecorder(stream, { mimeType: mimetype });
		chunksRef.current = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunksRef.current.push(event.data);
			}
		};
		recorder.onstop = () => {
			stopTimer();
			for (const track of stream.getTracks()) {
				track.stop();
			}
			const blob = new Blob(chunksRef.current, { type: mimetype });
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = String(reader.result);
				const base64 = dataUrl.split(",")[1] ?? "";
				if (!base64) {
					return;
				}
				setFiles((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						name: `voice-message.${mimetype.includes("ogg") ? "ogg" : "webm"}`,
						mimetype,
						base64,
						previewUrl: dataUrl,
					},
				]);
			};
			reader.readAsDataURL(blob);
			setRecording(false);
			setRecordSeconds(0);
		};
		recorderRef.current = recorder;
		recorder.start();
		setRecording(true);
		setRecordSeconds(0);
		timerRef.current = setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
	}

	function stopRecording() {
		recorderRef.current?.stop();
	}

	function cancelRecording() {
		const recorder = recorderRef.current;
		if (!recorder) {
			return;
		}
		recorder.onstop = () => {
			stopTimer();
			for (const track of recorder.stream.getTracks()) {
				track.stop();
			}
			setRecording(false);
			setRecordSeconds(0);
		};
		recorder.stop();
	}

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
		const attachments = files.map((file) => ({
			base64: file.base64,
			mimetype: file.mimetype,
			filename: file.name,
		}));
		send.mutate({
			chatId,
			text: raw,
			attachments: attachments.length ? attachments : undefined,
			fromSessionId: fromSessionId ?? undefined,
			subaccountId,
		});
	}

	const showPreview = preview.data && hasSendableContent(segments);

	return (
		<div className="gap-2 p-3 flex flex-col border-t bg-card/40">
			{files.length > 0 && (
				<div className="gap-2 flex flex-wrap">
					{files.map((file) => (
						<div key={file.id} className="relative">
							{file.mimetype.startsWith("image/") ? (
								// oxlint-disable-next-line jsx-a11y/alt-text
								<img src={file.previewUrl} alt="" className="size-16 rounded-lg object-cover" />
							) : file.mimetype.startsWith("audio/") ? (
								<div className="h-16 px-2 flex items-center rounded-lg border bg-muted">
									<audio controls src={file.previewUrl} className="h-9 w-48">
										<track kind="captions" />
									</audio>
								</div>
							) : (
								<div className="size-16 gap-1 p-1 flex flex-col items-center justify-center rounded-lg border bg-muted text-center">
									<FileIcon className="size-5 text-foreground/75" />
									<span className="w-full truncate text-[9px] text-foreground/75">{file.name}</span>
								</div>
							)}
							<button
								type="button"
								aria-label="Remove attachment"
								className="-right-1.5 -top-1.5 size-5 absolute flex items-center justify-center rounded-full bg-foreground text-background"
								onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
							>
								<XIcon className="size-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{showPreview && (
				<div className="gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs flex flex-wrap items-center rounded-lg bg-muted/50">
					<span className="font-medium shrink-0 text-foreground/65">Preview</span>
					<span className="min-w-0 flex-1 truncate">
						{preview.data?.actions.map((a) => a.text ?? `[${a.kind}]`).join("  ") || "—"}
					</span>
					{preview.data?.meta.delayMs ? (
						<span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 shrink-0">
							delay {preview.data.meta.delayMs}ms
						</span>
					) : null}
				</div>
			)}

			{recording && (
				<div className="gap-3 border-red-500/40 bg-red-500/5 px-3 py-2 flex items-center rounded-2xl border">
					<span className="size-2.5 animate-pulse bg-red-500 rounded-full" />
					<span className="font-medium text-red-600 text-sm tabular-nums">
						Recording {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
					</span>
					<div className="gap-1 ml-auto flex items-center">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 text-foreground/75"
							aria-label="Cancel recording"
							onClick={cancelRecording}
						>
							<Trash2Icon className="size-4" />
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-8 gap-1.5 px-3 rounded-full"
							onClick={stopRecording}
						>
							<SquareIcon className="size-3.5 fill-current" />
							Stop
						</Button>
					</div>
				</div>
			)}

			<div className="rounded-2xl border bg-card focus-within:ring-1 focus-within:ring-primary">
				<ChipEditor
					ref={editorRef}
					placeholder="Type a message, or add an emoji / file / variable…"
					onChange={setSegments}
					onEnter={runSend}
				/>
				<div className="gap-2 px-2 pb-2 flex items-center justify-between">
					<div className="gap-0.5 flex items-center">
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="hidden"
							onChange={onFilesSelected}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 text-foreground/75"
							aria-label="Attach file"
							onClick={() => fileInputRef.current?.click()}
						>
							<PaperclipIcon className="size-4" />
						</Button>

						<Button
							type="button"
							variant="ghost"
							size="icon"
							className={cn("size-8 text-foreground/75", recording && "text-red-600")}
							aria-label={recording ? "Stop recording" : "Record voice message"}
							onClick={recording ? stopRecording : startRecording}
						>
							<MicIcon className="size-4" />
						</Button>

						<Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 text-foreground/75"
									aria-label="Emoji"
								>
									<SmileIcon className="size-4" />
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="p-0 w-auto border-0">
								<EmojiPicker
									onEmojiClick={(emojiData) => editorRef.current?.insertText(emojiData.emoji)}
									lazyLoadEmojis
									width={320}
									height={380}
								/>
							</PopoverContent>
						</Popover>

						<Popover open={spintaxOpen} onOpenChange={setSpintaxOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs text-foreground/75"
								>
									<ShuffleIcon className="size-3.5" />
									Variable
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-72">
								<div className="gap-2 flex flex-col">
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
									<p className="text-xs text-foreground/65">
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
									className="h-8 gap-1 px-2 text-xs text-foreground/75"
								>
									<ClockIcon className="size-3.5" />
									Delay
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64">
								<div className="gap-2 flex flex-col">
									<Label className="text-xs">Random delay (seconds)</Label>
									<div className="gap-2 flex items-center">
										<Input
											type="number"
											min={0}
											step="0.5"
											value={delayMin}
											onChange={(e) => setDelayMin(e.target.value)}
										/>
										<span className="text-xs text-foreground/65">to</span>
										<Input
											type="number"
											min={0}
											step="0.5"
											value={delayMax}
											onChange={(e) => setDelayMax(e.target.value)}
										/>
									</div>
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
