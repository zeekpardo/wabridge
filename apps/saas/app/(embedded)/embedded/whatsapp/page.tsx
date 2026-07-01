import { WhatsAppTabs } from "@whatsapp/components/WhatsAppTabs";
import { EmbeddedSsoBootstrap } from "@whatsapp/components/inbox/EmbeddedSsoBootstrap";

export const metadata = {
	title: "WhatsApp",
};

/**
 * Tenant-agnostic embedded inbox — THE GoHighLevel Custom Page URL.
 *
 * GHL loads the same URL for every location that installs the app, so this page
 * carries no org/subaccount in its path. The GHL-SSO handshake
 * (EmbeddedSsoBootstrap → /api/ghl-sso/decrypt) maps the iframe's encrypted
 * locationId to a subaccount and mints an embedded token; the inbox's oRPC calls
 * then resolve the subaccount from that token. No first-party session required.
 */
export default function EmbeddedWhatsAppPage() {
	return (
		<>
			<EmbeddedSsoBootstrap />
			<WhatsAppTabs embedded />
		</>
	);
}
