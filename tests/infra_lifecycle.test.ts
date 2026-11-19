import "dotenv/config";
import { closeDatabase, pool, prisma } from "../src/prisma";
import { redis } from "../src/redis";

describe("Infrastructure lifecycle integration (Redis SCAN & pg Pool)", () => {
	const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const targetPrefix = `test:infra:delprefix:${runId}:`;
	const keepPrefix = `test:infra:keep:${runId}:`;

	beforeAll(async () => {
		if (process.env.REDIS_ENABLED !== "true") {
			return;
		}
		// Wait briefly for module-level client.connect() to finish opening socket
		const deadline = Date.now() + 3000;
		while (Date.now() < deadline) {
			try {
				if ((await redis.ping()) === "PONG") return;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
	});

	afterAll(async () => {
		const remainingKeep = await redis.scanKeys(`${keepPrefix}*`);
		for (const k of remainingKeep) {
			await redis.del(k);
		}
		await closeDatabase();
		await redis.disconnect();
	});

	it("deletes all keys matching prefix via iterative SCAN while preserving unrelated keys and handling 0-key prefix", async () => {
		if (process.env.REDIS_ENABLED !== "true") {
			return;
		}

		// Ensure Redis connection opened during module init is ready
		await expect(redis.ping()).resolves.toBe("PONG");

		const createdTargets: string[] = [];
		for (let i = 0; i < 220; i++) {
			const key = `${targetPrefix}item:${i}`;
			createdTargets.push(key);
		}
		const keepKey = `${keepPrefix}safe`;

		await Promise.all([
			...createdTargets.map((key) => redis.set(key, "1", 60)),
			redis.set(keepKey, "keep-me", 60),
		]);

		const beforeTargetKeys = await redis.scanKeys(`${targetPrefix}*`);
		expect(beforeTargetKeys).toHaveLength(220);

		await redis.delPrefix(targetPrefix);

		const afterTargetKeys = await redis.scanKeys(`${targetPrefix}*`);
		expect(afterTargetKeys).toHaveLength(0);

		const keptValue = await redis.get(keepKey);
		expect(keptValue).toBe("keep-me");

		// 0 matching keys should resolve cleanly
		await expect(redis.delPrefix(`${targetPrefix}nonexistent:`)).resolves.toBeUndefined();

		await redis.del(keepKey);
	});

	it("exports pg Pool and closes Prisma + Pool cleanly via closeDatabase", async () => {
		expect(pool).toBeDefined();
		expect(pool.ended).toBe(false);

		await prisma.$queryRaw`SELECT 1`;

		await closeDatabase();
		expect(pool.ended).toBe(true);

		// Idempotent second call must not throw
		await expect(closeDatabase()).resolves.toBeUndefined();
	});
});
