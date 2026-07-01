import { getActiveOrganization } from "@auth/lib/server";
import { SubaccountWorkspace } from "@whatsapp/components/SubaccountWorkspace";
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

	return <SubaccountWorkspace organizationSlug={organizationSlug} subaccountId={subaccountId} />;
}
