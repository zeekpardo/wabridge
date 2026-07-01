import { auth } from "@repo/auth";
import { getOrganizationBySlug, getSubaccountById } from "@repo/database";
import { WhatsAppTabs } from "@whatsapp/components/WhatsAppTabs";
import { EmbeddedSsoBootstrap } from "@whatsapp/components/inbox/EmbeddedSsoBootstrap";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const metadata = {
	title: "WhatsApp",
};

/**
 * Chrome-less WhatsApp inbox for a specific subaccount — the surface a
 * GoHighLevel Custom Page loads. Renders WITHOUT requiring a first-party session
 * (the GHL iframe is third-party, so the auth cookie is blocked): the org and
 * subaccount are resolved from the URL via plain lookups, and data access is
 * authorized at the oRPC layer by the embedded token that GHL-SSO mints. If a
 * first-party session happens to be present, we scope its active org too.
 */
export default async function EmbeddedSubaccountWhatsAppPage({
	params,
}: {
	params: Promise<{ organizationSlug: string; subaccountId: string }>;
}) {
	const { organizationSlug, subaccountId } = await params;

	const organization = await getOrganizationBySlug(organizationSlug);
	if (!organization) {
		return notFound();
	}

	const subaccount = await getSubaccountById(subaccountId);
	if (!subaccount || subaccount.organizationId !== organization.id) {
		return notFound();
	}

	// Best-effort: if a first-party session exists, point it at this agency so
	// direct (non-iframe) access works too. Ignored when there's no session.
	try {
		await auth.api.setActiveOrganization({
			body: { organizationId: organization.id },
			headers: await headers(),
		});
	} catch {
		// Third-party iframe / no session — the embedded token takes over.
	}

	return (
		<>
			<EmbeddedSsoBootstrap />
			<WhatsAppTabs embedded subaccountId={subaccount.id} />
		</>
	);
}
