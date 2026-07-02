"use client";

import { Button } from "@repo/ui/components/button";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, LinkIcon, XCircleIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * GoHighLevel install callback. GHL redirects here after the user picks a
 * location. We read `code` + `state` (the subaccount id), exchange the code via
 * the authenticated `connectGoHighLevel` mutation, then either notify the opener
 * popup or send the user back to their GHL location.
 *
 * GHL drops `state` when the app is already installed on the chosen location
 * (and marketplace install links never carry it), so a missing state falls back
 * to an inline subaccount picker instead of a dead end — the OAuth code is
 * short-lived, so the pick happens right here.
 */
export default function GhlCallbackPage() {
	const searchParams = useSearchParams();
	const code = searchParams.get("code");
	const stateSubaccountId = searchParams.get("state");
	const oauthError = searchParams.get("error");

	const [status, setStatus] = useState<"loading" | "pick" | "success" | "error">("loading");
	const [message, setMessage] = useState("");
	const hasRun = useRef(false);

	const connect = useMutation(orpc.whatsapp.connectGoHighLevel.mutationOptions());
	const subaccountsQuery = useQuery({
		...orpc.subaccounts.list.queryOptions({ input: {} }),
		enabled: status === "pick",
	});

	function notifyOpener(success: boolean, error?: string) {
		window.opener?.postMessage({ type: "OAUTH_CALLBACK_COMPLETE", success, error }, "*");
	}

	function runConnect(subaccountId: string) {
		if (!code) {
			return;
		}
		setStatus("loading");
		connect
			.mutateAsync({ subaccountId, code })
			.then(({ locationId }) => {
				setStatus("success");
				if (window.opener) {
					// Popup flow (started from the WABridge Control Panel): notify the
					// opener, give it a moment to receive the message, then close.
					setMessage("GoHighLevel connected.");
					notifyOpener(true);
					setTimeout(() => window.close(), 800);
					return;
				}
				// Direct navigation (started from GHL, e.g. a marketplace install):
				// send the user back to the sub-account they came from.
				setMessage("GoHighLevel connected. Returning you to your GHL sub-account…");
				setTimeout(() => {
					window.location.href = `https://app.gohighlevel.com/v2/location/${locationId}/`;
				}, 1200);
			})
			.catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : "Connection failed.";
				setStatus("error");
				setMessage(msg);
				notifyOpener(false, msg);
			});
	}

	useEffect(() => {
		if (hasRun.current) {
			return;
		}
		hasRun.current = true;

		if (oauthError || !code) {
			setStatus("error");
			setMessage(oauthError ?? "GoHighLevel did not return an authorization code.");
			notifyOpener(false, oauthError ?? "missing_code");
			return;
		}

		if (!stateSubaccountId) {
			// GHL dropped `state` (already-installed reinstall / marketplace link):
			// let the user pick which subaccount this location connects to.
			setStatus("pick");
			return;
		}

		runConnect(stateSubaccountId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const subaccounts = subaccountsQuery.data?.subaccounts ?? [];

	return (
		<div className="gap-4 p-8 flex min-h-[60vh] flex-col items-center justify-center text-center">
			{status === "loading" && (
				<>
					<div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-foreground/60">Connecting GoHighLevel…</p>
				</>
			)}
			{status === "pick" && (
				<>
					<LinkIcon className="size-12 text-primary" />
					<h2 className="font-semibold text-xl">Almost there</h2>
					<p className="max-w-md text-foreground/60">
						Which subaccount should this GoHighLevel location connect to?
					</p>
					{subaccountsQuery.isLoading ? (
						<div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					) : subaccounts.length === 0 ? (
						<p className="text-sm text-foreground/50">
							No subaccounts found — create one in the Control Panel first.
						</p>
					) : (
						<div className="gap-2 max-w-sm flex w-full flex-col">
							{subaccounts.map((sub) => (
								<Button
									key={sub.id}
									variant="outline"
									className="justify-between"
									disabled={connect.isPending}
									onClick={() => runConnect(sub.id)}
								>
									<span className="truncate">{sub.name}</span>
									{sub.ghlConnected ? (
										<span className="text-xs text-foreground/50">already connected</span>
									) : null}
								</Button>
							))}
						</div>
					)}
				</>
			)}
			{status === "success" && (
				<>
					<CheckCircleIcon className="size-14 text-emerald-500" />
					<h2 className="font-semibold text-xl">Connected</h2>
					<p className="text-foreground/60">{message}</p>
					<p className="text-sm text-foreground/40">You can close this window.</p>
				</>
			)}
			{status === "error" && (
				<>
					<XCircleIcon className="size-14 text-destructive" />
					<h2 className="font-semibold text-xl">Connection failed</h2>
					<p className="max-w-md text-foreground/60">{message}</p>
					<Button variant="outline" onClick={() => window.close()}>
						Close
					</Button>
				</>
			)}
		</div>
	);
}
