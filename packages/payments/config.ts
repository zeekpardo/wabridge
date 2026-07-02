import type { PaymentsConfig } from "./types";

export const config: PaymentsConfig = {
	// Agencies (organizations) own many sub-accounts, so the subscription and its
	// sub-account quota attach to the organization, not the individual user.
	billingAttachedTo: "organization",
	requireActiveSubscription: false,
	// Five tiers, each including a sub-account quota (enforced in the subaccounts
	// API via SUBACCOUNT_LIMITS). Yearly `amount` is the annual total (~20% off).
	plans: {
		solo: {
			prices: [
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_SOLO_MONTHLY as string,
					interval: "month",
					amount: 19,
					currency: "USD",
				},
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_SOLO_YEARLY as string,
					interval: "year",
					amount: 180,
					currency: "USD",
				},
			],
		},
		starter: {
			prices: [
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_STARTER_MONTHLY as string,
					interval: "month",
					amount: 49,
					currency: "USD",
				},
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_STARTER_YEARLY as string,
					interval: "year",
					amount: 468,
					currency: "USD",
				},
			],
		},
		pro: {
			recommended: true,
			prices: [
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_PRO_MONTHLY as string,
					interval: "month",
					amount: 79,
					currency: "USD",
				},
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_PRO_YEARLY as string,
					interval: "year",
					amount: 756,
					currency: "USD",
				},
			],
		},
		agency: {
			prices: [
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_AGENCY_MONTHLY as string,
					interval: "month",
					amount: 129,
					currency: "USD",
				},
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_AGENCY_YEARLY as string,
					interval: "year",
					amount: 1236,
					currency: "USD",
				},
			],
		},
		enterprise: {
			prices: [
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_ENTERPRISE_MONTHLY as string,
					interval: "month",
					amount: 199,
					currency: "USD",
				},
				{
					type: "subscription",
					priceId: process.env.PRICE_ID_ENTERPRISE_YEARLY as string,
					interval: "year",
					amount: 1908,
					currency: "USD",
				},
			],
		},
	},
};
