import { Badge } from "@repo/ui/components/badge";

type BadgeStatus = "success" | "warning" | "error" | "info";

const STATUS_META: Record<string, { label: string; status: BadgeStatus }> = {
	created: { label: "Starting", status: "info" },
	initializing: { label: "Starting", status: "info" },
	qr_ready: { label: "Scan QR", status: "warning" },
	authenticating: { label: "Linking", status: "warning" },
	ready: { label: "Connected", status: "success" },
	disconnected: { label: "Disconnected", status: "error" },
	failed: { label: "Failed", status: "error" },
};

export function SessionStatusBadge({ status }: { status: string }) {
	const meta = STATUS_META[status] ?? { label: status, status: "info" as const };
	return <Badge status={meta.status}>{meta.label}</Badge>;
}

export function isConnected(status: string): boolean {
	return status === "ready";
}

export function isPending(status: string): boolean {
	return (
		status === "created" ||
		status === "initializing" ||
		status === "qr_ready" ||
		status === "authenticating"
	);
}
