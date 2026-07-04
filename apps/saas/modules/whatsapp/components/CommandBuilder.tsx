"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ClockIcon,
	ContactIcon,
	CopyIcon,
	FilePlus2Icon,
	MapPinIcon,
	SaveIcon,
	ShuffleIcon,
	Trash2Icon,
	UserIcon,
	VariableIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Pick a message-level spintax letter (A-Z) not already declared in the text. */
function nextSpintaxLetter(text: string): string {
	const used = new Set([...text.matchAll(/!\/SPINTAX_([A-Z])\//g)].map((match) => match[1]));
	for (const letter of LETTERS) {
		if (!used.has(letter)) {
			return letter;
		}
	}
	return "A";
}

/** Substitute GHL merge tokens (`{{contact.x}}`) with a sample contact's values. */
function fillSampleContact(text: string, values: Record<string, string>): string {
	return text.replace(
		/\{\{\s*([\w.]+)\s*\}\}/g,
		(match, key: string) => values[`{{${key}}}`] ?? match,
	);
}

export function CommandBuilder({ subaccountId }: { subaccountId?: string }) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState("");
	const [spintaxInput, setSpintaxInput] = useState("");
	const [spintaxOpen, setSpintaxOpen] = useState(false);
	const [delayOpen, setDelayOpen] = useState(false);
	const [delayMin, setDelayMin] = useState("1");
	const [delayMax, setDelayMax] = useState("4");
	const [saveOpen, setSaveOpen] = useState(false);
	const [templateName, setTemplateName] = useState("");
	// The saved template currently loaded into the editor (so Save updates it).
	const [loadedId, setLoadedId] = useState<string | null>(null);
	const [contactVarsOpen, setContactVarsOpen] = useState(false);
	const [globalOpen, setGlobalOpen] = useState(false);
	const [contactCardOpen, setContactCardOpen] = useState(false);
	const [contactCardName, setContactCardName] = useState("");
	const [contactCardPhone, setContactCardPhone] = useState("");
	const [locationOpen, setLocationOpen] = useState(false);
	const [locationLat, setLocationLat] = useState("");
	const [locationLng, setLocationLng] = useState("");
	const [locationNote, setLocationNote] = useState("");
	const [locationAddress, setLocationAddress] = useState("");

	// Global spintax variables defined in Settings — offer the non-blank ones as
	// one-click inserts so operators don't have to remember the ${SPINTAX_n} names.
	const settingsQuery = useQuery(
		orpc.whatsapp.getSettings.queryOptions({ input: { subaccountId } }),
	);
	const globalVars = useMemo(() => {
		const globals =
			(settingsQuery.data?.globalSpintax as Record<string, string[]> | undefined) ?? {};
		return Object.entries(globals)
			.filter(([, options]) => options.length > 0)
			.sort(([a], [b]) => a.localeCompare(b));
	}, [settingsQuery.data]);

	// GHL contact merge fields (standard + the location's custom fields). GHL
	// fills these per-contact before the message reaches us — insertion only.
	const contactVarsQuery = useQuery(
		orpc.whatsapp.listContactVariables.queryOptions({ input: { subaccountId } }),
	);
	const contactVarGroups = useMemo(() => {
		const variables = contactVarsQuery.data?.variables ?? [];
		const standard = variables.filter((entry) => entry.group === "Standard");
		const custom = variables.filter((entry) => entry.group === "Custom fields");
		return { standard, custom };
	}, [contactVarsQuery.data]);

	const templates = useMemo(() => {
		const list = settingsQuery.data?.messageTemplates ?? [];
		return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}, [settingsQuery.data]);

	const saveTemplate = useMutation(
		orpc.whatsapp.saveMessageTemplate.mutationOptions({
			onSuccess: () => {
				toastSuccess("Template saved");
				setSaveOpen(false);
				void settingsQuery.refetch();
			},
			onError: (error) => toastError(error.message ?? "Could not save template"),
		}),
	);

	const deleteTemplate = useMutation(
		orpc.whatsapp.deleteMessageTemplate.mutationOptions({
			onSuccess: (_data, variables) => {
				toastSuccess("Template deleted");
				if (variables.id === loadedId) {
					setLoadedId(null);
				}
				void settingsQuery.refetch();
			},
			onError: (error) => toastError(error.message ?? "Could not delete template"),
		}),
	);

	const preview = useMutation(orpc.whatsapp.previewCommand.mutationOptions());
	const previewMutate = preview.mutate;

	// A real GHL contact used to fill {{contact.*}} tokens in the preview (GHL
	// fills these itself at send time; this just shows what it will look like).
	const [sample, setSample] = useState<{ label: string; values: Record<string, string> } | null>(
		null,
	);
	const sampleContact = useMutation(
		orpc.whatsapp.getSampleContact.mutationOptions({
			onSuccess: (result) => {
				if (result.contact) {
					setSample(result.contact);
				} else {
					toastError("No GoHighLevel contact available to preview with");
				}
			},
			onError: (error) => toastError(error.message ?? "Could not load a sample contact"),
		}),
	);

	// Debounced live resolution of exactly what will be copied out.
	useEffect(() => {
		if (text.trim().length === 0) {
			preview.reset();
			return;
		}
		const handle = setTimeout(() => previewMutate({ text, subaccountId }), 400);
		return () => clearTimeout(handle);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [text, subaccountId]);

	function insertAtCursor(snippet: string) {
		const el = textareaRef.current;
		if (!el) {
			setText((prev) => prev + snippet);
			return;
		}
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const next = text.slice(0, start) + snippet + text.slice(end);
		setText(next);
		requestAnimationFrame(() => {
			el.focus();
			const caret = start + snippet.length;
			el.setSelectionRange(caret, caret);
		});
	}

	function insertGlobal(name: string) {
		insertAtCursor(`\${${name}}`);
	}

	function insertSpintax() {
		const options = spintaxInput
			.split(",")
			.map((option) => option.replace(/\//g, " ").trim())
			.filter(Boolean);
		if (options.length === 0) {
			return;
		}
		const letter = nextSpintaxLetter(text);
		insertAtCursor(
			`!/SPINTAX_${letter}/${options.join("/")}/SPINTAX_${letter}/!\${SPINTAX_${letter}}`,
		);
		setSpintaxInput("");
		setSpintaxOpen(false);
	}

	function insertDelay() {
		const min = Math.round((Number.parseFloat(delayMin) || 0) * 1000);
		const max = Math.round((Number.parseFloat(delayMax) || 0) * 1000);
		const lead = text.length === 0 || text.endsWith(" ") ? "" : " ";
		insertAtCursor(`${lead}!/DELAY/${Math.min(min, max)}/${Math.max(min, max)}/!`);
		setDelayOpen(false);
	}

	function insertContactCard() {
		const name = contactCardName.trim();
		const phone = contactCardPhone.trim();
		if (name.length === 0 || phone.length === 0) {
			return;
		}
		insertAtCursor(`#contact|${name}|${phone}`);
		setContactCardName("");
		setContactCardPhone("");
		setContactCardOpen(false);
	}

	function insertLocation() {
		const lat = locationLat.trim();
		const lng = locationLng.trim();
		if (lat.length === 0 || lng.length === 0) {
			return;
		}
		const note = locationNote.trim();
		const address = locationAddress.trim();
		insertAtCursor(`#location|${lat}|${lng}|${note}|${address}`);
		setLocationLat("");
		setLocationLng("");
		setLocationNote("");
		setLocationAddress("");
		setLocationOpen(false);
	}

	async function copyText(value: string) {
		if (value.trim().length === 0) {
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			toastSuccess("Command copied — paste it into GoHighLevel's bulk SMS editor");
		} catch {
			toastError("Could not copy to clipboard");
		}
	}

	function saveCurrent() {
		const name = templateName.trim();
		if (name.length === 0 || text.trim().length === 0) {
			return;
		}
		// Own the id for new templates so a follow-up save updates rather than duplicates.
		const id = loadedId ?? crypto.randomUUID();
		setLoadedId(id);
		saveTemplate.mutate({ id, name, text, subaccountId });
	}

	function loadTemplate(template: (typeof templates)[number]) {
		setText(template.text);
		setTemplateName(template.name);
		setLoadedId(template.id);
	}

	function startNew() {
		setText("");
		setTemplateName("");
		setLoadedId(null);
	}

	return (
		<Card className="gap-4 p-5 flex flex-col">
			<div>
				<h3 className="font-medium">Bulk message builder</h3>
				<p className="text-sm text-foreground/75">
					Write your message and drop in variables or a delay. The box below is the exact command —
					copy it into GoHighLevel's bulk SMS editor. We resolve it per recipient (random wording
					and a random pause) so bulk sends read as human.
				</p>
			</div>

			<div className="gap-4 lg:grid-cols-2 grid">
				{/* Left: the single compile-in-place command field + insert helpers. */}
				<div className="gap-2 flex flex-col">
					<div className="gap-1.5 flex flex-wrap items-center">
						<Popover open={globalOpen} onOpenChange={setGlobalOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<VariableIcon className="size-3.5" />
									Global variable
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64 p-0">
								{globalVars.length > 0 ? (
									<div className="max-h-72 p-1 overflow-y-auto">
										{globalVars.map(([name, options]) => (
											<button
												key={name}
												type="button"
												className="gap-0.5 px-2 py-1.5 flex w-full flex-col rounded-md text-left hover:bg-muted"
												onClick={() => {
													insertGlobal(name);
													setGlobalOpen(false);
												}}
											>
												<code className="text-xs">{`\${${name}}`}</code>
												<span className="truncate text-[11px] text-foreground/55">
													{options.join(", ")}
												</span>
											</button>
										))}
									</div>
								) : (
									<p className="p-3 text-xs text-foreground/60">
										Define reusable variables in the Settings tab to insert them here.
									</p>
								)}
							</PopoverContent>
						</Popover>

						<Popover open={spintaxOpen} onOpenChange={setSpintaxOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<ShuffleIcon className="size-3.5" />
									Spintax
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
												insertSpintax();
											}
										}}
									/>
									<p className="text-xs text-foreground/65">Each recipient gets a random option.</p>
									<Button size="sm" onClick={insertSpintax}>
										Insert variable
									</Button>
								</div>
							</PopoverContent>
						</Popover>

						<Popover open={delayOpen} onOpenChange={setDelayOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
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
									<p className="text-xs text-foreground/65">
										One delay per message — placed at the end.
									</p>
									<Button size="sm" onClick={insertDelay}>
										Insert delay
									</Button>
								</div>
							</PopoverContent>
						</Popover>

						<Popover open={contactVarsOpen} onOpenChange={setContactVarsOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<UserIcon className="size-3.5" />
									Contact field
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64 p-0">
								<div className="max-h-72 p-1 overflow-y-auto">
									<p className="px-2 pt-1.5 pb-1 font-medium tracking-wide text-[11px] text-foreground/50 uppercase">
										Standard
									</p>
									{contactVarGroups.standard.map((variable) => (
										<button
											key={variable.token}
											type="button"
											className="gap-2 px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left hover:bg-muted"
											onClick={() => {
												insertAtCursor(variable.token);
												setContactVarsOpen(false);
											}}
										>
											<span className="flex-1 truncate">{variable.label}</span>
											<code className="text-[10px] text-foreground/50">{variable.token}</code>
										</button>
									))}

									{contactVarGroups.custom.length > 0 && (
										<>
											<p className="px-2 pt-2 pb-1 font-medium tracking-wide text-[11px] text-foreground/50 uppercase">
												Custom fields
											</p>
											{contactVarGroups.custom.map((variable) => (
												<button
													key={variable.token}
													type="button"
													className="px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left hover:bg-muted"
													onClick={() => {
														insertAtCursor(variable.token);
														setContactVarsOpen(false);
													}}
												>
													<span className="flex-1 truncate">{variable.label}</span>
												</button>
											))}
										</>
									)}

									{contactVarsQuery.isLoading && (
										<p className="px-2 py-2 text-xs text-foreground/60">Loading custom fields…</p>
									)}
								</div>
								<p className="px-3 py-2 border-t text-[11px] text-foreground/55">
									GoHighLevel fills these for each contact when it sends.
								</p>
							</PopoverContent>
						</Popover>

						<Popover open={contactCardOpen} onOpenChange={setContactCardOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<ContactIcon className="size-3.5" />
									Contact card
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-72">
								<div className="gap-2 flex flex-col">
									<Label className="text-xs">Name</Label>
									<Input
										// oxlint-disable-next-line no-autofocus
										autoFocus
										placeholder="Jane Doe"
										value={contactCardName}
										onChange={(e) => setContactCardName(e.target.value)}
									/>
									<Label className="text-xs">Phone (with country code)</Label>
									<Input
										placeholder="+1 555 123 4567"
										value={contactCardPhone}
										onChange={(e) => setContactCardPhone(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												insertContactCard();
											}
										}}
									/>
									<Button size="sm" onClick={insertContactCard}>
										Insert contact card
									</Button>
								</div>
							</PopoverContent>
						</Popover>

						<Popover open={locationOpen} onOpenChange={setLocationOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
								>
									<MapPinIcon className="size-3.5" />
									Location
								</Button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-72">
								<div className="gap-2 flex flex-col">
									<Label className="text-xs">Latitude</Label>
									<Input
										// oxlint-disable-next-line no-autofocus
										autoFocus
										placeholder="37.7749"
										value={locationLat}
										onChange={(e) => setLocationLat(e.target.value)}
									/>
									<Label className="text-xs">Longitude</Label>
									<Input
										placeholder="-122.4194"
										value={locationLng}
										onChange={(e) => setLocationLng(e.target.value)}
									/>
									<Label className="text-xs">Note (optional)</Label>
									<Input
										placeholder="Meet at the front desk"
										value={locationNote}
										onChange={(e) => setLocationNote(e.target.value)}
									/>
									<Label className="text-xs">Address (optional)</Label>
									<Input
										placeholder="1 Market St, San Francisco, CA"
										value={locationAddress}
										onChange={(e) => setLocationAddress(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												insertLocation();
											}
										}}
									/>
									<Button size="sm" onClick={insertLocation}>
										Insert location
									</Button>
								</div>
							</PopoverContent>
						</Popover>
					</div>

					<Textarea
						ref={textareaRef}
						rows={8}
						className="font-mono text-sm"
						placeholder={"Hi ${SPINTAX_1}, quick question about your enquiry…"}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>

					<div className="gap-2 flex items-center justify-between">
						<div className="min-w-0 text-xs text-foreground/60">
							{loadedId ? (
								<span className="truncate">
									Editing <span className="font-medium text-foreground/80">{templateName}</span>
								</span>
							) : (
								<span>Unsaved draft</span>
							)}
						</div>
						<div className="gap-2 flex items-center">
							{loadedId && (
								<Button type="button" variant="ghost" size="sm" onClick={startNew}>
									<FilePlus2Icon className="mr-1.5 size-3.5" />
									New
								</Button>
							)}
							<Popover open={saveOpen} onOpenChange={setSaveOpen}>
								<PopoverTrigger asChild>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={text.trim().length === 0}
									>
										<SaveIcon className="mr-1.5 size-3.5" />
										{loadedId ? "Update" : "Save"}
									</Button>
								</PopoverTrigger>
								<PopoverContent align="end" className="w-72">
									<div className="gap-2 flex flex-col">
										<Label className="text-xs">Template name</Label>
										<Input
											// oxlint-disable-next-line no-autofocus
											autoFocus
											placeholder="Follow-up nudge"
											value={templateName}
											onChange={(e) => setTemplateName(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													saveCurrent();
												}
											}}
										/>
										<Button
											size="sm"
											loading={saveTemplate.isPending}
											disabled={templateName.trim().length === 0}
											onClick={saveCurrent}
										>
											{loadedId ? "Update template" : "Save template"}
										</Button>
									</div>
								</PopoverContent>
							</Popover>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								disabled={text.trim().length === 0}
								onClick={() => copyText(text)}
							>
								<CopyIcon className="mr-1.5 size-3.5" />
								Copy command
							</Button>
						</div>
					</div>
				</div>

				{/* Right: live preview of the resolved message. */}
				<div className="gap-2 p-3 flex flex-col rounded-lg border bg-muted/40">
					<div className="flex items-center justify-between">
						<p className="text-xs font-medium tracking-wide text-foreground/75 uppercase">
							Preview
							{preview.data?.meta.spintaxApplied ? " · spintax applied" : ""}
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-2 text-xs text-foreground/75"
							disabled={text.trim().length === 0}
							loading={preview.isPending}
							onClick={() => previewMutate({ text, subaccountId })}
						>
							<ShuffleIcon className="size-3.5" />
							Shuffle
						</Button>
					</div>

					{/* Preview against a real GHL contact so merge fields show filled-in. */}
					{text.includes("{{") && (
						<div className="gap-2 text-xs flex flex-wrap items-center">
							{sample ? (
								<>
									<span className="text-foreground/60">Previewing as</span>
									<Badge status="info">{sample.label}</Badge>
									<button
										type="button"
										className="text-foreground/70 underline-offset-2 hover:underline"
										onClick={() => sampleContact.mutate({ subaccountId })}
									>
										{sampleContact.isPending ? "loading…" : "shuffle profile"}
									</button>
									<button
										type="button"
										className="text-foreground/50 underline-offset-2 hover:underline"
										onClick={() => setSample(null)}
									>
										clear
									</button>
								</>
							) : (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 gap-1 px-2 text-xs text-foreground/75"
									loading={sampleContact.isPending}
									onClick={() => sampleContact.mutate({ subaccountId })}
								>
									<UserIcon className="size-3.5" />
									Preview with a real contact
								</Button>
							)}
						</div>
					)}

					{text.trim().length === 0 ? (
						<p className="py-8 text-sm text-center text-foreground/60">
							Start typing to see how each recipient's message will look.
						</p>
					) : (
						<>
							{preview.data?.meta.unresolvedSpintax && (
								<p className="bg-amber-500/10 px-2 py-1 text-amber-600 text-xs rounded-md">
									⚠️ Undefined spintax removed: {preview.data.meta.unresolvedSpintax.join(", ")}
								</p>
							)}
							{preview.data && preview.data.actions.length === 0 ? (
								<p className="text-sm text-foreground/75">Nothing to send.</p>
							) : (
								preview.data?.actions.map((action, i) => (
									<div key={i} className="gap-2 text-sm flex items-start">
										<Badge status="info">{action.kind}</Badge>
										<div className="min-w-0 flex-1">
											{action.text && (
												<p className="whitespace-pre-wrap">
													{sample ? fillSampleContact(action.text, sample.values) : action.text}
												</p>
											)}
											{action.delayMs ? (
												<p className="text-amber-600 text-xs">
													delay {(action.delayMs / 1000).toFixed(1)}s
												</p>
											) : null}
										</div>
									</div>
								))
							)}
						</>
					)}
				</div>
			</div>

			{templates.length > 0 && (
				<div className="gap-2 pt-1 flex flex-col border-t">
					<Label className="pt-3 text-xs text-foreground/65">Saved templates</Label>
					<div className="gap-1.5 flex flex-col">
						{templates.map((template) => (
							<div
								key={template.id}
								className="gap-2 px-3 py-2 flex items-center rounded-lg border bg-card"
							>
								<button
									type="button"
									className="min-w-0 flex-1 text-left"
									onClick={() => loadTemplate(template)}
									title="Load into the builder"
								>
									<p className="text-sm font-medium truncate">{template.name}</p>
									<p className="text-xs font-mono truncate text-foreground/60">{template.text}</p>
								</button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="shrink-0"
									onClick={() => loadTemplate(template)}
								>
									Load
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 shrink-0 text-foreground/75"
									aria-label="Copy template"
									onClick={() => copyText(template.text)}
								>
									<CopyIcon className="size-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 shrink-0 text-foreground/75"
									aria-label="Delete template"
									loading={deleteTemplate.isPending && deleteTemplate.variables?.id === template.id}
									onClick={() => deleteTemplate.mutate({ id: template.id, subaccountId })}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</Card>
	);
}
