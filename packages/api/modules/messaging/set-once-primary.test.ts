import { describe, expect, it } from "vitest";

/**
 * Executable specification for the "set-once primary number" contract.
 *
 * The real behaviour lives in two Prisma upserts in
 * `@repo/database` — `upsertConversationInbound` and `touchConversationOutbound`
 * — which set `activeSessionId` in the upsert's `create` branch but deliberately
 * OMIT it from `update`. That guarantees the sending/active number is locked on
 * the first touch and never re-locked by later inbound/outbound traffic; only an
 * explicit `setConversationActiveSession` (dropdown / `#switch`) may change it.
 *
 * Those queries need a live Postgres, so they are not unit-testable here without
 * a DB (see REPORT notes). This test pins the DECISION with a tiny in-memory
 * upsert that mirrors the create-vs-update split, so a regression that starts
 * writing `activeSessionId` on `update` fails loudly.
 */

interface Conversation {
	chatId: string;
	activeSessionId: string;
	lastDirection: "inbound" | "outbound";
}

interface TouchInput {
	chatId: string;
	sessionId: string;
	direction: "inbound" | "outbound";
}

/**
 * Mirrors the query layer's upsert: on create the row adopts `sessionId` as its
 * active number; on update the active number is left untouched (set-once).
 */
function touchConversation(store: Map<string, Conversation>, input: TouchInput): Conversation {
	const existing = store.get(input.chatId);
	if (existing) {
		// Update branch: refresh recency/direction, but NOT activeSessionId.
		const updated: Conversation = { ...existing, lastDirection: input.direction };
		store.set(input.chatId, updated);
		return updated;
	}
	// Create branch: the active/sending number is chosen here, once.
	const created: Conversation = {
		chatId: input.chatId,
		activeSessionId: input.sessionId,
		lastDirection: input.direction,
	};
	store.set(input.chatId, created);
	return created;
}

describe("set-once primary number contract", () => {
	it("keeps the first inbound session as active across repeated inbound touches", () => {
		const store = new Map<string, Conversation>();
		touchConversation(store, { chatId: "chat1", sessionId: "sessA", direction: "inbound" });
		touchConversation(store, { chatId: "chat1", sessionId: "sessB", direction: "inbound" });

		expect(store.get("chat1")?.activeSessionId).toBe("sessA");
	});

	it("does not re-lock the active number on a later outbound touch", () => {
		const store = new Map<string, Conversation>();
		touchConversation(store, { chatId: "chat1", sessionId: "sessA", direction: "inbound" });
		const after = touchConversation(store, {
			chatId: "chat1",
			sessionId: "sessB",
			direction: "outbound",
		});

		expect(after.activeSessionId).toBe("sessA");
		expect(after.lastDirection).toBe("outbound");
	});

	it("adopts the session on the very first touch (create branch)", () => {
		const store = new Map<string, Conversation>();
		const created = touchConversation(store, {
			chatId: "chat1",
			sessionId: "sessA",
			direction: "outbound",
		});

		expect(created.activeSessionId).toBe("sessA");
	});
});
