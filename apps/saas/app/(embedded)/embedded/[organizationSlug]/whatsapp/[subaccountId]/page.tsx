import { getActiveOrganization } from "@auth/lib/server";
import { auth } from "@repo/auth";
import { getSubaccount } from "@repo/database";
import { WhatsAppInbox } from "@whatsapp/components/inbox/WhatsAppInbox";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const metadata = {
	title: "WhatsApp",
};

/**
 * Chrome-less WhatsApp inbox for a specific subaccount — the per-location surface
 * a GoHighLevel Custom Page loads. Scopes the session's active org to the
 * subaccount's agency, then renders the inbox bound to that subaccount id.
 *
 * GHL SSO (env-gated, separate) will resolve the subaccount from the iframe's
 * encrypted locationId instead of relying on the first-party session.
 */
export default async function EmbeddedSubaccountWhatsAppPage({
	params,
}: {
	params: Promise<{ organizationSlug: string; subaccountId: string }>;
}) {
	const { organizationSlug, subaccountId } = await params;

	const organization = await getActiveOrganization(organizationSlug);
	if (!organization) {
		return notFound();
	}

	// The subaccount must belong to this agency org.
	const subaccount = await getSubaccount(organization.id, subaccountId);
	if (!subaccount) {
		return notFound();
	}

	try {
		await auth.api.setActiveOrganization({
			body: { organizationId: organization.id },
			headers: await headers(),
		});
	} catch {
		// Not a member / no session — the inbox's own auth handling takes over.
	}

	return <WhatsAppInbox embedded subaccountId={subaccount.id} />;
}
