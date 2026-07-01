import { getActiveOrganization } from "@auth/lib/server";
import { PageHeader } from "@shared/components/PageHeader";
import { WhatsAppNumbers } from "@whatsapp/components/WhatsAppNumbers";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	return {
		title: "WhatsApp",
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
			<PageHeader
				title="WhatsApp"
				subtitle="Connect WhatsApp numbers and send messages for this organization."
			/>
			<WhatsAppNumbers />
		</>
	);
}
