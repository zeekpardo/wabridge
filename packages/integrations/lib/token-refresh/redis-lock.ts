import { randomUUID } from "node:crypto";

/**
 * Minimal Redis distributed lock using SET NX EX.
 * Falls back to no-op when REDIS_URL is not set (local dev without Redis).
 */

let redisInstance: import("ioredis").Redis | null = null;
let redisUnavailable = false;

async function getRedis(): Promise<import("ioredis").Redis | null> {
	if (redisUnavailable) return null;

	const url = process.env.REDIS_URL;
	if (!url) {
		redisUnavailable = true;
		return null;
	}

	if (redisInstance) return redisInstance;

	try {
		const { default: Redis } = await import("ioredis");
		redisInstance = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
		await redisInstance.connect();
		return redisInstance;
	} catch {
		redisUnavailable = true;
		return null;
	}
}

const LOCK_TTL_SECONDS = 30;
const WAIT_POLL_MS = 200;
const WAIT_TIMEOUT_MS = 10_000;

// Lua script: atomic check-and-delete
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

interface LockResult {
	acquired: boolean;
	uuid: string;
}

async function acquireLock(redis: import("ioredis").Redis, key: string): Promise<LockResult> {
	const uuid = randomUUID();
	const result = await redis.set(key, uuid, "EX", LOCK_TTL_SECONDS, "NX");
	return { acquired: result === "OK", uuid };
}

async function releaseLock(
	redis: import("ioredis").Redis,
	key: string,
	uuid: string,
): Promise<void> {
	await redis.eval(RELEASE_SCRIPT, 1, key, uuid);
}

async function waitForLockRelease(redis: import("ioredis").Redis, key: string): Promise<void> {
	const deadline = Date.now() + WAIT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const exists = await redis.exists(key);
		if (!exists) return;
		await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
	}
}

/**
 * Execute `fn` while holding a distributed Redis lock.
 * Returns `{ executed: true, result }` if this process won the lock,
 * or `{ executed: false }` if another process holds it (after waiting for release).
 *
 * When Redis is unavailable, executes `fn` directly (in-process only).
 */
export async function withDistributedLock<T>(
	lockKey: string,
	fn: () => Promise<T>,
): Promise<{ executed: true; result: T } | { executed: false }> {
	const redis = await getRedis();

	if (!redis) {
		// No Redis — run in-process (acceptable for local dev)
		const result = await fn();
		return { executed: true, result };
	}

	const lock = await acquireLock(redis, lockKey);

	if (lock.acquired) {
		try {
			const result = await fn();
			return { executed: true, result };
		} finally {
			await releaseLock(redis, lockKey, lock.uuid).catch(() => {});
		}
	}

	// Another process holds the lock — wait for it to finish
	await waitForLockRelease(redis, lockKey);
	return { executed: false };
}
