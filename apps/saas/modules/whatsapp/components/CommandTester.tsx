"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { EyeIcon, SendIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";

const PLACEHOLDER = `Type a message. Commands are supported, e.g.:

!/SPINTAX_A/Hello/Hi/Hey/SPINTAX_A/!
\${SPINTAX_A} there 👋 !/DELAY/1000/4000/!`;

function guessMimetype(url: string): string | undefined {
	const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase();
	if (!ext) return undefined;
	if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
		return `image/${ext === "jpg" ? "jpeg" : ext}`;
	if (["mp4", "mov", "webm"].includes(ext)) return `video/${ext}`;
	if (["mp3", "ogg", "wav", "m4a"].includes(ext)) return `audio/${ext}`;
	return "application/octet-stream";
}

function parseAttachments(raw: string) {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((url) => ({ url, mimetype: guessMimetype(url) }));
}

export function CommandTester({
	sessionId,
	subaccountId,
}: {
	sessionId: string;
	subaccountId?: string;
}) {
	const [open, setOpen] = useState(false);
	const [toPhone, setToPhone] = useState("");
	const [text, setText] = useState("");
	const [attachmentsRaw, setAttachmentsRaw] = useState("");

	const messagesQuery = useQuery({
		...orpc.whatsapp.listMessages.queryOptions({
			input: { id: sessionId, limit: 20, subaccountId },
		}),
		enabled: open,
	});

	const preview = useMutation(
		orpc.whatsapp.previewCommand.mutationOptions({
			onError: (error) => toastError(error.message ?? "Preview failed"),
		}),
	);

	const send = useMutation(
		orpc.whatsapp.sendMessage.mutationOptions({
			onSuccess: (result) => {
				toastSuccess(`Sent ${result.sent} message${result.sent === 1 ? "" : "s"}`);
				setText("");
				setAttachmentsRaw("");
				preview.reset();
				void messagesQuery.refetch();
			},
			onError: (error) => toastError(error.message ?? "Send failed"),
		}),
	);

	const attachments = parseAttachments(attachmentsRaw);

	function runPreview() {
		preview.mutate({
			text,
			attachments: attachments.length ? attachments : undefined,
			subaccountId,
		});
	}

	function runSend() {
		send.mutate({
			toPhone,
			text,
			attachments: attachments.length ? attachments : undefined,
			fromSessionId: sessionId,
			subaccountId,
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" size="sm">
					<TerminalIcon className="mr-1.5 size-3.5" />
					Test
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Command tester</DialogTitle>
					<DialogDescription>
						Compose a message with commands, preview how it resolves, then send it.
					</DialogDescription>
				</DialogHeader>

				<div className="gap-3 flex flex-col">
					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="ct-text">Message</Label>
						<Textarea
							id="ct-text"
							rows={5}
							className="font-mono text-sm"
							placeholder={PLACEHOLDER}
							value={text}
							onChange={(e) => setText(e.target.value)}
						/>
					</div>

					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="ct-attach">Attachment URLs (one per line, optional)</Label>
						<Textarea
							id="ct-attach"
							rows={2}
							className="text-sm"
							placeholder="https://example.com/photo.jpg"
							value={attachmentsRaw}
							onChange={(e) => setAttachmentsRaw(e.target.value)}
						/>
					</div>

					<Button variant="outline" onClick={runPreview} loading={preview.isPending}>
						<EyeIcon className="mr-1.5 size-4" />
						Preview
					</Button>

					{preview.data && (
						<div className="gap-2 p-3 flex flex-col rounded-lg border bg-muted/40">
							<p className="text-xs font-medium tracking-wide text-foreground/75 uppercase">
								Resolves to {preview.data.actions.length} action
								{preview.data.actions.length === 1 ? "" : "s"}
								{preview.data.meta.spintaxApplied ? " · spintax applied" : ""}
							</p>
							{preview.data.meta.unresolvedSpintax && (
								<p className="bg-amber-500/10 px-2 py-1 text-amber-600 text-xs rounded-md">
									⚠️ Undefined spintax removed: {preview.data.meta.unresolvedSpintax.join(", ")}
								</p>
							)}
							{preview.data.actions.length === 0 ? (
								<p className="text-sm text-foreground/75">Nothing to send.</p>
							) : (
								preview.data.actions.map((action, i) => (
									<div key={i} className="gap-2 text-sm flex items-start">
										<Badge status="info">{action.kind}</Badge>
										<div className="min-w-0 flex-1">
											{action.url && (
												<p className="text-xs truncate text-foreground/75">{action.url}</p>
											)}
											{action.text && <p className="whitespace-pre-wrap">{action.text}</p>}
											{action.delayMs ? (
												<p className="text-amber-600 text-xs">delay {action.delayMs} ms</p>
											) : null}
										</div>
									</div>
								))
							)}
						</div>
					)}

					<div className="gap-2 flex items-end">
						<div className="gap-1.5 flex flex-1 flex-col">
							<Label htmlFor="ct-phone">To (digits, country code)</Label>
							<Input
								id="ct-phone"
								inputMode="numeric"
								placeholder="15555550100"
								value={toPhone}
								onChange={(e) => setToPhone(e.target.value.replace(/\D/g, ""))}
							/>
						</div>
						<Button
							disabled={toPhone.length < 8 || (text.length === 0 && attachments.length === 0)}
							loading={send.isPending}
							onClick={runSend}
						>
							<SendIcon className="mr-1.5 size-4" />
							Send
						</Button>
					</div>

					{messagesQuery.data && messagesQuery.data.length > 0 && (
						<div className="mt-1 max-h-48 gap-1 p-2 flex flex-col overflow-y-auto rounded-lg border">
							{messagesQuery.data.map((m) => (
								<div
									key={m.id}
									className={`px-2 py-1 text-sm rounded-md ${
										m.direction === "outbound"
											? "self-end bg-primary/10 text-right"
											: "self-start bg-muted"
									}`}
								>
									{m.body ?? `[${m.type}]`}
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
