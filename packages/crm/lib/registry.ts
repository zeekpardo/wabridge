import type { CrmProvider } from "./provider";

/**
 * A registered CRM integration. `meta` describes it (for a "connect a CRM"
 * picker); `load` returns a live {@link CrmProvider} for a subaccount when that
 * CRM is connected, else null.
 *
 * This is the ONE extension point for adding a CRM: append a registration here
 * (its own connection table + provider impl) and every downstream caller —
 * the messaging mirror, the contact panel, groups — stays vendor-agnostic.
 */
export interface CrmProviderRegistration {
	/** Stable id, e.g. "gohighlevel". Matches CrmProvider.type. */
	type: string;
	/** Human label for the connect UI, e.g. "GoHighLevel". */
	label: string;
	/** How a subaccount authenticates this CRM (drives the connect flow). */
	authType: "oauth" | "apiKey";
	/** Resolve a live provider for the subaccount, or null when not connected. */
	load(subaccountId: string): Promise<CrmProvider | null>;
}

const REGISTRY: CrmProviderRegistration[] = [];

/** Register a CRM integration. Called once per provider at module load. */
export function registerCrmProvider(registration: CrmProviderRegistration): void {
	if (REGISTRY.some((r) => r.type === registration.type)) {
		return;
	}
	REGISTRY.push(registration);
}

/** Metadata for every registered CRM — drives a "connect a CRM" picker. */
export function listCrmProviders(): ReadonlyArray<Omit<CrmProviderRegistration, "load">> {
	return REGISTRY.map(({ type, label, authType }) => ({ type, label, authType }));
}

/**
 * Resolve the CRM provider a subaccount is connected to, or null when none is.
 * Tries each registered CRM's loader in registration order; the first connected
 * one wins (a subaccount connects a single CRM). No caller knows which CRM it is.
 */
export async function resolveCrmProvider(subaccountId: string): Promise<CrmProvider | null> {
	for (const registration of REGISTRY) {
		const provider = await registration.load(subaccountId);
		if (provider) {
			return provider;
		}
	}
	return null;
}

/** The `type` of the CRM a subaccount is connected to (for the UI/status), or null. */
export async function getConnectedCrmType(subaccountId: string): Promise<string | null> {
	const provider = await resolveCrmProvider(subaccountId);
	return provider?.type ?? null;
}
