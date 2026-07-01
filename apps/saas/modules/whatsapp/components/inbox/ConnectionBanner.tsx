"use client";

import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { isPending } from "../SessionStatusBadge";

/**
 * Surfaces lost WhatsApp connections in the embedded view.
 *
 * OpenWA drops every session to `disconnected` when its worker restarts (creds
 * persist, so a re-start reconnects without a QR). Nothing reflected that before
 * — a disconnected number just showed an empty thread. On mount we reconcile the
 * subaccount's sessions (which re-starts dropped ones) and, until they're back,
 * show a banner with a manual Reconnect. A number the worker no longer knows
 * (`needsQr`) can't auto-heal, so we point the user to the Connections tab.
 */
export function ConnectionBanner({ subaccountId }: { subaccountId?: string }) {
	const queryClient = useQueryClient();
	const didAutoReconcile = useRef(false);

	const sessionsQuery = useQuery({
		...orpc.whatsapp.listSessions.queryOptions({ input: { subaccountId } }),
		// Keep polling while anything is mid-reconnect so the banner clears itself.
		refetchInterval: (query) =>
			(query.state.data ?? []).some((s) => isPending(s.status)) ? 3000 : false,
	});

	function refreshConnections() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listSessions.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listNumbers.key() });
	}

	const reconcile = useMutation(
		orpc.whatsapp.reconcileConnections.mutationOptions({ onSuccess: () => refreshConnections() }),
	);

	// One self-heal pass on mount: re-start anything OpenWA dropped on restart.
	useEffect(() => {
		if (didAutoReconcile.current) {
			return;
		}
		didAutoReconcile.current = true;
		reconcile.mutate({ subaccountId });
	}, [reconcile, subaccountId]);

	const sessions = sessionsQuery.data ?? [];
	if (sessions.length === 0) {
		return null; // No numbers linked yet — the empty states handle that.
	}

	const needsQr = sessions.some((s) => s.needsQr);
	const reconnecting = reconcile.isPending || sessions.some((s) => isPending(s.status));
	const down = sessions.filter((s) => s.status === "disconnected" || s.status === "failed");

	// Everything healthy and nothing in flight → no banner.
	if (!needsQr && !reconnecting && down.length === 0) {
		return null;
	}

	if (needsQr) {
		return (
			<Banner tone="error" icon={<WifiOffIcon className="size-4 shrink-0" />}>
				<span className="flex-1">
					A WhatsApp number needs to be re-linked. Open the <strong>Connections</strong> tab to scan
					the QR code.
				</span>
				<ReconnectButton
					pending={reconcile.isPending}
					onClick={() => reconcile.mutate({ subaccountId })}
				/>
			</Banner>
		);
	}

	if (reconnecting) {
		return (
			<Banner tone="warning" icon={<Spinner className="size-4 shrink-0" />}>
				<span className="flex-1">Reconnecting your WhatsApp number…</span>
			</Banner>
		);
	}

	return (
		<Banner tone="warning" icon={<AlertTriangleIcon className="size-4 shrink-0" />}>
			<span className="flex-1">
				{down.length > 1 ? `${down.length} WhatsApp numbers are` : "A WhatsApp number is"}{" "}
				disconnected. Incoming and outgoing messages are paused until it reconnects.
			</span>
			<ReconnectButton
				pending={reconcile.isPending}
				onClick={() => reconcile.mutate({ subaccountId })}
			/>
		</Banner>
	);
}

function ReconnectButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
	return (
		<Button
			size="sm"
			variant="outline"
			className="h-7 shrink-0"
			disabled={pending}
			onClick={onClick}
		>
			{pending ? "Reconnecting…" : "Reconnect"}
		</Button>
	);
}

function Banner({
	tone,
	icon,
	children,
}: {
	tone: "warning" | "error";
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	const tones = {
		warning: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
		error: "border-destructive/30 bg-destructive/10 text-destructive",
	};
	return (
		<div
			className={`gap-2 px-3 py-2 text-sm flex items-center border-b ${tones[tone]}`}
			aria-live="polite"
		>
			{icon}
			{children}
		</div>
	);
}
