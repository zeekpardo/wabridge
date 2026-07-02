import { getActiveOrganization } from "@auth/lib/server";
import { auth } from "@repo/auth";
import { PageHeader } from "@shared/components/PageHeader";
import { ControlPanel } from "@whatsapp/components/ControlPanel";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	return {
		title: "Control Panel",
	};
}

export default async function WhatsAppPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;
	const organization = await getActiveOrganization(organizationSlug);

	if (!organization) {
		return notFound();
	}

	// Align the session's active org with the org in the URL, so org-scoped data
	// calls (subaccount roster, etc.) can't resolve against a stale active org
	// from another agency this user belongs to.
	await auth.api.setActiveOrganization({
		body: { organizationId: organization.id },
		headers: await headers(),
	});

	return (
		<>
			<PageHeader title="Control Panel" subtitle="Manage your WhatsApp subaccounts." />
			<ControlPanel organizationSlug={organizationSlug} />
		</>
	);
}
