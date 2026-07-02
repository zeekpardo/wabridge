import { getActiveOrganization } from "@auth/lib/server";
import { syncSubaccountNameFromGhl } from "@repo/api/modules/ghl/sync-subaccount-name";
import { auth } from "@repo/auth";
import { SubaccountWorkspace } from "@whatsapp/components/SubaccountWorkspace";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	return {
		title: "Subaccount",
	};
}

export default async function SubaccountPage({
	params,
}: {
	params: Promise<{ organizationSlug: string; subaccountId: string }>;
}) {
	const { organizationSlug, subaccountId } = await params;
	const organization = await getActiveOrganization(organizationSlug);

	if (!organization) {
		return notFound();
	}

	// Align the session's active org with the org in the URL (multi-org users),
	// so org-scoped data calls don't resolve against a stale active org.
	await auth.api.setActiveOrganization({
		body: { organizationId: organization.id },
		headers: await headers(),
	});

	// On-view sync: refresh a GHL-linked subaccount's name from its location.
	// Best-effort and no-op for manual subaccounts.
	await syncSubaccountNameFromGhl(subaccountId);

	return <SubaccountWorkspace organizationSlug={organizationSlug} subaccountId={subaccountId} />;
}
