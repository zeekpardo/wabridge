"use client";

import { Button } from "@repo/ui/components/button";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * GoHighLevel install callback. GHL redirects here (in the OAuth popup) after the
 * user picks a location. We read `code` + `state` (the subaccount id), exchange
 * the code via the authenticated `connectGoHighLevel` mutation, then notify the
 * opener window and close.
 */
export default function GhlCallbackPage() {
	const searchParams = useSearchParams();
	const code = searchParams.get("code");
	const subaccountId = searchParams.get("state");
	const oauthError = searchParams.get("error");

	const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
	const [message, setMessage] = useState("");
	const hasRun = useRef(false);

	const connect = useMutation(orpc.whatsapp.connectGoHighLevel.mutationOptions());

	useEffect(() => {
		if (hasRun.current) {
			return;
		}
		hasRun.current = true;

		function notifyOpener(success: boolean, error?: string) {
			window.opener?.postMessage({ type: "OAUTH_CALLBACK_COMPLETE", success, error }, "*");
		}

		if (oauthError || !code || !subaccountId) {
			setStatus("error");
			setMessage(oauthError ?? "Missing code or subaccount in the callback.");
			notifyOpener(false, oauthError ?? "missing_params");
			return;
		}

		connect
			.mutateAsync({ subaccountId, code })
			.then(() => {
				setStatus("success");
				setMessage("GoHighLevel connected.");
				notifyOpener(true);
				// Give the opener a moment to receive the message, then close the popup.
				setTimeout(() => window.close(), 800);
			})
			.catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : "Connection failed.";
				setStatus("error");
				setMessage(msg);
				notifyOpener(false, msg);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="gap-4 p-8 flex min-h-[60vh] flex-col items-center justify-center text-center">
			{status === "loading" && (
				<>
					<div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-foreground/60">Connecting GoHighLevel…</p>
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
