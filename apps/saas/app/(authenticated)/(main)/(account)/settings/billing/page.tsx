import { getOrganizationList, getSession } from "@auth/lib/server";
import { ActivePlan } from "@payments/components/ActivePlan";
import { ChangePlan } from "@payments/components/ChangePlan";
import { listPurchases } from "@payments/lib/server";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { PageHeader } from "@shared/components/PageHeader";
import { SettingsList } from "@shared/components/SettingsList";
import { orpc } from "@shared/lib/orpc-query-utils";
import { getServerQueryClient } from "@shared/lib/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("settings.billing");

	return {
		title: t("title"),
	};
}

export default async function BillingSettingsPage() {
	const session = await getSession();
	if (!session) {
		redirect("/login");
	}

	// Billing is attached to the organization — account-level billing has no plan
	// of its own, so send the user to their active organization's billing page.
	if (paymentsConfig.billingAttachedTo === "organization") {
		const organizations = await getOrganizationList();
		const organization =
			organizations.find((org) => org.id === session.session.activeOrganizationId) ||
			organizations[0];
		if (!organization) {
			redirect("/new-organization");
		}
		redirect(`/${organization.slug}/settings/billing`);
	}

	const purchases = await listPurchases();

	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery({
		queryKey: orpc.payments.listPurchases.queryKey({
			input: {},
		}),
		queryFn: () => purchases,
	});

	const { activePlan } = createPurchasesHelper(purchases);

	const t = await getTranslations("settings.billing");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("changePlan.description")} />

			<SettingsList>
				{activePlan && <ActivePlan />}
				<ChangePlan userId={session?.user.id} activePlanId={activePlan?.id} />
			</SettingsList>
		</>
	);
}
