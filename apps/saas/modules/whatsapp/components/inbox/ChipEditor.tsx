"use client";

import { cn } from "@repo/ui";
import type { MessageSegment } from "@repo/whatsapp/commands";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export interface ChipEditorHandle {
	insertSpintax: (options: string[]) => void;
	insertDelay: (minMs: number, maxMs: number) => void;
	insertText: (text: string) => void;
	getSegments: () => MessageSegment[];
	clear: () => void;
	focus: () => void;
}

interface ChipEditorProps {
	placeholder?: string;
	onChange?: (segments: MessageSegment[]) => void;
	onEnter?: () => void;
}

const CHIP_BASE =
	"mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium select-none cursor-default";

function secondsLabel(ms: number): string {
	const seconds = ms / 1000;
	return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function makeSpintaxChip(options: string[]): HTMLSpanElement {
	const span = document.createElement("span");
	span.dataset.kind = "spintax";
	span.dataset.options = options.join("|");
	span.contentEditable = "false";
	span.className = cn(CHIP_BASE, "bg-primary/10 text-primary");
	span.title = `Spintax → ${options.join(" / ")}\nCompiles to: !/SPINTAX_x/${options.join("/")}/SPINTAX_x/!`;
	const extra = options.length > 1 ? ` +${options.length - 1}` : "";
	span.textContent = `⤭ ${options[0] ?? ""}${extra}`;
	return span;
}

function makeDelayChip(minMs: number, maxMs: number): HTMLSpanElement {
	const span = document.createElement("span");
	span.dataset.kind = "delay";
	span.dataset.min = String(minMs);
	span.dataset.max = String(maxMs);
	span.contentEditable = "false";
	span.className = cn(CHIP_BASE, "bg-amber-500/10 text-amber-600");
	span.title = `Random delay ${minMs}–${maxMs} ms\nCompiles to: !/DELAY/${minMs}/${maxMs}/!`;
	span.textContent = `⏱ ${secondsLabel(minMs)}–${secondsLabel(maxMs)}`;
	return span;
}

function readSegments(root: HTMLElement): MessageSegment[] {
	const segments: MessageSegment[] = [];
	root.childNodes.forEach((node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const value = (node.textContent ?? "").replace(/ /g, " ");
			if (value) {
				segments.push({ type: "text", value });
			}
			return;
		}
		if (node instanceof HTMLElement) {
			if (node.tagName === "BR") {
				segments.push({ type: "text", value: "\n" });
				return;
			}
			if (node.dataset.kind === "spintax") {
				segments.push({
					type: "spintax",
					options: (node.dataset.options ?? "").split("|").filter(Boolean),
				});
				return;
			}
			if (node.dataset.kind === "delay") {
				segments.push({
					type: "delay",
					minMs: Number(node.dataset.min ?? 0),
					maxMs: Number(node.dataset.max ?? 0),
				});
				return;
			}
			const value = (node.textContent ?? "").replace(/ /g, " ");
			if (value) {
				segments.push({ type: "text", value });
			}
		}
	});
	return segments;
}

export const ChipEditor = forwardRef<ChipEditorHandle, ChipEditorProps>(function ChipEditor(
	{ placeholder, onChange, onEnter },
	ref,
) {
	const editorRef = useRef<HTMLDivElement>(null);
	const [isEmpty, setIsEmpty] = useState(true);

	function emitChange() {
		const el = editorRef.current;
		if (!el) {
			return;
		}
		setIsEmpty(el.textContent?.trim().length === 0 && el.querySelector("[data-kind]") === null);
		onChange?.(readSegments(el));
	}

	function insertNode(node: Node) {
		const el = editorRef.current;
		if (!el) {
			return;
		}
		el.focus();
		const selection = window.getSelection();
		let range: Range;
		if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
			range = selection.getRangeAt(0);
		} else {
			range = document.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
		}
		range.deleteContents();
		range.insertNode(node);
		const spacer = document.createTextNode(" ");
		node.parentNode?.insertBefore(spacer, node.nextSibling);
		range.setStartAfter(spacer);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
		emitChange();
	}

	useImperativeHandle(ref, () => ({
		insertSpintax: (options) => insertNode(makeSpintaxChip(options)),
		insertDelay: (minMs, maxMs) => insertNode(makeDelayChip(minMs, maxMs)),
		insertText: (text) => insertNode(document.createTextNode(text)),
		getSegments: () => (editorRef.current ? readSegments(editorRef.current) : []),
		clear: () => {
			if (editorRef.current) {
				editorRef.current.innerHTML = "";
				setIsEmpty(true);
			}
		},
		focus: () => editorRef.current?.focus(),
	}));

	return (
		<div className="relative">
			{isEmpty && placeholder && (
				<div className="left-3.5 top-3 text-sm pointer-events-none absolute text-foreground/40">
					{placeholder}
				</div>
			)}
			{/* A rich chip editor requires a contentEditable div, not an input/textarea. */}
			{/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
			<div
				ref={editorRef}
				role="textbox"
				aria-label="Message"
				aria-multiline="true"
				tabIndex={0}
				contentEditable
				suppressContentEditableWarning
				className="min-h-11 px-3.5 py-3 text-sm break-words whitespace-pre-wrap outline-none"
				onInput={emitChange}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						onEnter?.();
					}
				}}
				onPaste={(event) => {
					// Paste as plain text so no foreign markup enters the editor.
					event.preventDefault();
					const text = event.clipboardData.getData("text/plain");
					document.execCommand("insertText", false, text);
				}}
			/>
		</div>
	);
});
