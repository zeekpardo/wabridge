import { getActiveOrganization } from "@auth/lib/server";
import { auth } from "@repo/auth";
import { EmbeddedSsoBootstrap } from "@whatsapp/components/inbox/EmbeddedSsoBootstrap";
import { WhatsAppInbox } from "@whatsapp/components/inbox/WhatsAppInbox";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const metadata = {
	title: "WhatsApp",
};

/**
 * Chrome-less WhatsApp inbox for embedding as a GoHighLevel Custom Page.
 *
 * Step 1 (this): renders the inbox full-bleed for the org in the URL, scoped via
 * the current session (works first-party / in dev).
 *
 * Next: GHL SSO — the iframe posts an encrypted context to /api/ghl-sso/decrypt,
 * we map the GHL location -> org, mint an embedded token, and drop the session
 * dependency (third-party iframe cookies are blocked).
 */
export default async function EmbeddedWhatsAppPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;

	const organization = await getActiveOrganization(organizationSlug);
	if (!organization) {
		return notFound();
	}

	// Scope the session's active org to this location's org so the inbox oRPC
	// (which reads activeOrganizationId) targets the right tenant. SSO will do
	// the equivalent mapping from the GHL locationId later.
	try {
		await auth.api.setActiveOrganization({
			body: { organizationId: organization.id },
			headers: await headers(),
		});
	} catch {
		// Not a member / no session — the inbox's own auth handling takes over.
	}

	return (
		<>
			<EmbeddedSsoBootstrap />
			<WhatsAppInbox embedded />
		</>
	);
}
