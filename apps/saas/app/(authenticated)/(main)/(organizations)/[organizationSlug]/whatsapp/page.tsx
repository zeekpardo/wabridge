import { getActiveOrganization } from "@auth/lib/server";
import { PageHeader } from "@shared/components/PageHeader";
import { ControlPanel } from "@whatsapp/components/ControlPanel";
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

	return (
		<>
			<PageHeader title="Control Panel" subtitle="Manage your WhatsApp subaccounts." />
			<ControlPanel organizationSlug={organizationSlug} />
		</>
	);
}
