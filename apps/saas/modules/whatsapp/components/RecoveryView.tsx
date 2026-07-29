"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw, X } from "lucide-react";
import { useMemo, useState } from "react";

interface RecoveryRow {
	id: string;
	chatId: string;
	phone: string | null;
	body: string | null;
	reason: string;
	attempts: number;
	createdAt: string | Date;
}

/** "3m ago" / "2h ago" / "5d ago" — good enough for a queue timestamp. */
function timeAgo(value: string | Date): string {
	const then = new Date(value).getTime();
	const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
	if (secs < 60) return `${secs}s ago`;
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

function recipientLabel(row: RecoveryRow): string {
	if (row.phone) return row.phone;
	const digits = row.chatId.replace(/@.*/, "");
	return digits ? `+${digits}` : row.chatId;
}

export function RecoveryView({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();
	const listQuery = useQuery(
		orpc.whatsapp.listRecovery.queryOptions({ input: { subaccountId } }),
	);
	const rows = useMemo(() => (listQuery.data ?? []) as RecoveryRow[], [listQuery.data]);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [delaySeconds, setDelaySeconds] = useState(5);
	const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number }>({
		running: false,
		done: 0,
		total: 0,
	});

	const resend = useMutation(orpc.whatsapp.resendRecovery.mutationOptions());
	const dismiss = useMutation(orpc.whatsapp.dismissRecovery.mutationOptions());

	function invalidate() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listRecovery.key() });
	}

	const allSelected = rows.length > 0 && selected.size === rows.length;
	const busy = bulk.running || resend.isPending || dismiss.isPending;

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAll() {
		setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
	}

	async function resendOne(id: string) {
		try {
			await resend.mutateAsync({ subaccountId, id });
			toastSuccess("Message resent");
			invalidate();
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not resend");
		}
	}

	async function dismissOne(id: string) {
		try {
			await dismiss.mutateAsync({ subaccountId, id });
			invalidate();
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not dismiss");
		}
	}

	// Bulk resend, spaced by the chosen delay so a burst doesn't hammer the number.
	async function resendMany(ids: string[]) {
		if (ids.length === 0) return;
		setBulk({ running: true, done: 0, total: ids.length });
		let ok = 0;
		let failed = 0;
		for (let i = 0; i < ids.length; i++) {
			try {
				await resend.mutateAsync({ subaccountId, id: ids[i] });
				ok++;
			} catch {
				failed++;
			}
			setBulk((b) => ({ ...b, done: i + 1 }));
			if (i < ids.length - 1 && delaySeconds > 0) {
				await new Promise((r) => setTimeout(r, delaySeconds * 1000));
			}
		}
		setBulk({ running: false, done: 0, total: 0 });
		setSelected(new Set());
		invalidate();
		if (failed === 0) {
			toastSuccess(`Resent ${ok} message${ok === 1 ? "" : "s"}`);
		} else {
			toastError(`Resent ${ok}; ${failed} still could not be delivered`);
		}
	}

	const targetIds = useMemo(
		() => (selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows).map((r) => r.id),
		[rows, selected],
	);

	if (listQuery.isLoading) {
		return (
			<div className="flex items-center justify-center py-16 text-muted-foreground">
				<Spinner className="mr-2 size-4" /> Loading failed messages…
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed py-16 text-center">
				<p className="font-medium">You&apos;re all caught up</p>
				<p className="mt-1 text-sm text-muted-foreground">
					No messages failed to send. Anything that fails while a number is disconnected shows up
					here to resend.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="font-semibold">
						Recovery{" "}
						<Badge className="ml-1 align-middle">{rows.length}</Badge>
					</h3>
					<p className="text-sm text-muted-foreground">
						Messages that couldn&apos;t be delivered. Reconnect the number, then resend.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						Delay
						<input
							type="number"
							min={0}
							max={60}
							value={delaySeconds}
							onChange={(e) => setDelaySeconds(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
							disabled={busy}
							className="h-9 w-16 rounded-md border bg-background px-2 text-sm"
						/>
						s
					</label>
					<Button onClick={() => resendMany(targetIds)} disabled={busy || targetIds.length === 0}>
						{bulk.running ? (
							<>
								<Spinner className="mr-2 size-4" />
								Resending {bulk.done}/{bulk.total}
							</>
						) : (
							`Resend ${selected.size > 0 ? `selected (${selected.size})` : "all"}`
						)}
					</Button>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10">
								<input
									type="checkbox"
									aria-label="Select all"
									checked={allSelected}
									onChange={toggleAll}
									disabled={busy}
									className="size-4 cursor-pointer accent-primary"
								/>
							</TableHead>
							<TableHead>Recipient</TableHead>
							<TableHead>Message</TableHead>
							<TableHead>Failed</TableHead>
							<TableHead>Reason</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
								<TableCell>
									<input
										type="checkbox"
										aria-label={`Select message to ${recipientLabel(row)}`}
										checked={selected.has(row.id)}
										onChange={() => toggle(row.id)}
										disabled={busy}
										className="size-4 cursor-pointer accent-primary"
									/>
								</TableCell>
								<TableCell className="font-medium whitespace-nowrap">{recipientLabel(row)}</TableCell>
								<TableCell className="max-w-[24rem] truncate text-muted-foreground">
									{row.body || <span className="italic">(no text)</span>}
								</TableCell>
								<TableCell className="whitespace-nowrap text-muted-foreground">
									{timeAgo(row.createdAt)}
									{row.attempts > 0 ? (
										<span className="ml-1 text-xs">· {row.attempts} tries</span>
									) : null}
								</TableCell>
								<TableCell className="whitespace-nowrap text-muted-foreground">{row.reason}</TableCell>
								<TableCell className="text-right whitespace-nowrap">
									<Button
										size="sm"
										variant="outline"
										onClick={() => resendOne(row.id)}
										disabled={busy}
									>
										<RotateCw className="mr-1 size-3.5" />
										Resend
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => dismissOne(row.id)}
										disabled={busy}
										aria-label="Dismiss"
										className="ml-1"
									>
										<X className="size-3.5" />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
