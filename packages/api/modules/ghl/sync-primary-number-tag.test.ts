import type { GoHighLevelClient } from "@repo/integrations";
import { describe, expect, it, vi } from "vitest";

import { syncPrimaryNumberTag } from "./sync-primary-number-tag";

interface MockClientOptions {
	tags?: unknown;
}

function mockClient({ tags }: MockClientOptions = {}) {
	const getContact = vi.fn().mockResolvedValue({ id: "c1", tags });
	const updateContact = vi.fn().mockResolvedValue({ id: "c1" });
	// Only the two methods syncPrimaryNumberTag touches are stubbed; cast to the
	// full client type (mirrors the loose-mock style used across these tests).
	const client = { getContact, updateContact } as unknown as GoHighLevelClient;
	return { client, getContact, updateContact };
}

describe("syncPrimaryNumberTag", () => {
	it("adds wa:<digits> when the contact has no wa: tag", async () => {
		const { client, updateContact } = mockClient({ tags: ["vip"] });
		await syncPrimaryNumberTag(client, "c1", "+1 (555) 123-4567");

		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["vip", "wa:15551234567"] });
	});

	it("strips whatever domain-y characters and keeps only the phone digits", async () => {
		const { client, updateContact } = mockClient({ tags: [] });
		await syncPrimaryNumberTag(client, "c1", "+44-7700-900123");

		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["wa:447700900123"] });
	});

	it("replaces a stale wa: tag rather than accumulating (number change)", async () => {
		const { client, updateContact } = mockClient({ tags: ["wa:15550000000", "vip"] });
		await syncPrimaryNumberTag(client, "c1", "15551234567");

		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["vip", "wa:15551234567"] });
	});

	it("strips a case-variant WA: tag", async () => {
		const { client, updateContact } = mockClient({ tags: ["WA:15550000000"] });
		await syncPrimaryNumberTag(client, "c1", "15551234567");

		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["wa:15551234567"] });
	});

	it("converges to the same tag set when the wa: tag already matches (idempotent result)", async () => {
		const { client, updateContact } = mockClient({ tags: ["vip", "wa:15551234567"] });
		await syncPrimaryNumberTag(client, "c1", "+15551234567");

		// Re-running on an already-correct contact yields an identical tag list — the
		// result is a fixed point (the write is a no-op in effect).
		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["vip", "wa:15551234567"] });
	});

	it("still writes when a matching tag coexists with a stale wa: tag (dedupes to one)", async () => {
		const { client, updateContact } = mockClient({
			tags: ["wa:15551234567", "wa:15550000000"],
		});
		await syncPrimaryNumberTag(client, "c1", "15551234567");

		// Both wa: tags are stripped, then the correct one re-added exactly once.
		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["wa:15551234567"] });
	});

	it("returns without touching GHL when the phone has no digits", async () => {
		const { client, getContact, updateContact } = mockClient({ tags: [] });
		await syncPrimaryNumberTag(client, "c1", "no-digits-here");

		expect(getContact).not.toHaveBeenCalled();
		expect(updateContact).not.toHaveBeenCalled();
	});

	it("tolerates a contact with no tags array", async () => {
		const { client, updateContact } = mockClient({ tags: undefined });
		await syncPrimaryNumberTag(client, "c1", "15551234567");

		expect(updateContact).toHaveBeenCalledWith("c1", { tags: ["wa:15551234567"] });
	});

	it("swallows GHL errors (best-effort; never throws to the caller)", async () => {
		const getContact = vi.fn().mockRejectedValue(new Error("GHL down"));
		const updateContact = vi.fn();
		const client = { getContact, updateContact } as unknown as GoHighLevelClient;

		await expect(syncPrimaryNumberTag(client, "c1", "15551234567")).resolves.toBeUndefined();
		expect(updateContact).not.toHaveBeenCalled();
	});
});
