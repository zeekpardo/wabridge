import { describe, expect, it } from "vitest";

import type { CrmProvider } from "./provider";
import { listCrmProviders, registerCrmProvider, resolveCrmProvider } from "./registry";

describe("CRM provider registry", () => {
	it("registers providers, lists their metadata, and resolves the first connected one", async () => {
		const providerB = { type: "test-b" } as unknown as CrmProvider;

		// A is registered first but never connects; B connects only for "sub1".
		registerCrmProvider({ type: "test-a", label: "A", authType: "apiKey", load: async () => null });
		registerCrmProvider({
			type: "test-b",
			label: "B",
			authType: "oauth",
			load: async (subaccountId) => (subaccountId === "sub1" ? providerB : null),
		});

		const metas = listCrmProviders();
		expect(metas.some((m) => m.type === "test-a")).toBe(true);
		expect(metas.find((m) => m.type === "test-b")?.authType).toBe("oauth");

		// A returns null → falls through to B, which connects for sub1.
		expect(await resolveCrmProvider("sub1")).toBe(providerB);
		// Nothing connects for another subaccount.
		expect(await resolveCrmProvider("other")).toBeNull();
	});

	it("ignores a duplicate type registration (first wins)", () => {
		const before = listCrmProviders().length;
		registerCrmProvider({
			type: "test-a",
			label: "dup",
			authType: "apiKey",
			load: async () => null,
		});
		expect(listCrmProviders()).toHaveLength(before);
	});
});
