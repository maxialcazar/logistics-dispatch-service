import { createClient } from 'redis';

const redisEnabled = process.env.REDIS_ENABLED === 'true';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const client = createClient({
	url: redisUrl,
});

client.on('error', (err) => {
	if (redisEnabled) {
		console.error('Redis Client Error', err);
	}
});

if (redisEnabled) {
	client.connect().then(() => {
		console.log('🚀 Connected to Redis');
	}).catch((err) => {
		console.error('❌ Failed to connect to Redis', err);
	});
}

const SCAN_COUNT = 100;
const UNLINK_BATCH_SIZE = 500;

async function scanEachPage(
	pattern: string,
	onKeys: (keys: string[]) => Promise<void>
): Promise<void> {
	let cursor = "0";
	do {
		if (!client.isOpen) break;
		const { cursor: nextCursor, keys } = await client.scan(cursor, {
			MATCH: pattern,
			COUNT: SCAN_COUNT,
		});
		cursor = String(nextCursor);
		if (keys.length > 0) {
			await onKeys(keys);
		}
	} while (cursor !== "0" && client.isOpen);
}

export const redis = {
	async ping(): Promise<string> {
		if (!redisEnabled || !client.isOpen) {
			throw new Error("redis_not_connected");
		}
		return client.ping();
	},
	async get(key: string) {
		if (!redisEnabled || !client.isOpen) return null;
		return client.get(key);
	},
	async set(key: string, value: string, ttlSeconds?: number) {
		if (!redisEnabled || !client.isOpen) return;
		if (ttlSeconds) {
			await client.set(key, value, { EX: ttlSeconds });
		} else {
			await client.set(key, value);
		}
	},
	async del(key: string) {
		if (!redisEnabled || !client.isOpen) return;
		await client.del(key);
	},
	async scanKeys(pattern: string): Promise<string[]> {
		if (!redisEnabled || !client.isOpen) return [];
		const found = new Set<string>();
		await scanEachPage(pattern, async (keys) => {
			for (const key of keys) {
				found.add(key);
			}
		});
		return Array.from(found);
	},
	async delPrefix(prefix: string) {
		try {
			if (!redisEnabled || !client.isOpen) return;
			await scanEachPage(`${prefix}*`, async (keys) => {
				for (let i = 0; i < keys.length; i += UNLINK_BATCH_SIZE) {
					const batch = keys.slice(i, i + UNLINK_BATCH_SIZE);
					if (batch.length > 0) {
						await client.unlink(batch);
					}
				}
			});
		} catch (error) {
			console.error(`Error deleting prefix ${prefix} in Redis:`, error);
		}
	},
	async requeueLocationIfNewer(
		bufferKey: string,
		driverId: string,
		rawPayload: string,
		entryTs: number
	): Promise<boolean> {
		if (!redisEnabled || !client.isOpen) return false;
		const luaScript = `
			local current = redis.call('HGET', KEYS[1], ARGV[1])
			if not current then
				redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
				return 1
			end
			local ok, parsed = pcall(cjson.decode, current)
			if not ok or type(parsed) ~= 'table' then
				return 0
			end
			local currentTs = tonumber(parsed.ts)
			local entryTs = tonumber(ARGV[3])
			if currentTs and entryTs and entryTs > currentTs then
				redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
				return 1
			end
			return 0
		`;
		const res = await client.eval(luaScript, {
			keys: [bufferKey],
			arguments: [driverId, rawPayload, String(entryTs)],
		});
		return res === 1 || res === "1";
	},
	async disconnect() {
		if (client.isOpen) {
			await client.quit();
			console.log('🛑 Redis disconnected');
		}
	},

	// Pub/Sub capabilities
	async publish(channel: string, message: string) {
		if (!redisEnabled || !client.isOpen) return;
		await client.publish(channel, message);
	},
    
    // Hash Operations for Buffering
    async hSet(key: string, field: string, value: string) {
        if (!redisEnabled || !client.isOpen) return;
        await client.hSet(key, field, value);
    },
    async hGet(key: string, field: string) {
        if (!redisEnabled || !client.isOpen) return null;
        return (await client.hGet(key, field)) ?? null;
    },
    async hGetAll(key: string) {
        if (!redisEnabled || !client.isOpen) return {};
        return client.hGetAll(key);
    },
    async hmGet(key: string, fields: string[]): Promise<Array<string | null>> {
        if (!redisEnabled || !client.isOpen || fields.length === 0) return [];
        return client.hmGet(key, fields);
    },
    async hDel(key: string, ...fields: string[]) {
        if (!redisEnabled || !client.isOpen || fields.length === 0) return;
        await client.hDel(key, fields);
    },
    async claimLocationSyncBuffer(
        bufferKey: string,
        syncKey: string,
        lockKey: string,
        lockToken: string,
        lockTtlMs: number
    ): Promise<boolean> {
        if (!redisEnabled || !client.isOpen) return false;
        const luaScript = `
            local acquired = redis.call('SET', KEYS[3], ARGV[1], 'NX', 'PX', ARGV[2])
            if not acquired then
                return 0
            end
            local hasSync = redis.call('EXISTS', KEYS[2])
            local hasBuf = redis.call('EXISTS', KEYS[1])
            if hasSync == 0 and hasBuf == 0 then
                if redis.call('GET', KEYS[3]) == ARGV[1] then
                    redis.call('DEL', KEYS[3])
                end
                return 0
            end
            if hasSync == 0 and hasBuf == 1 then
                redis.call('RENAME', KEYS[1], KEYS[2])
                return 1
            end
            if hasSync == 1 and hasBuf == 1 then
                local bufEntries = redis.call('HGETALL', KEYS[1])
                for i = 1, #bufEntries, 2 do
                    local field = bufEntries[i]
                    local bufVal = bufEntries[i + 1]
                    local syncVal = redis.call('HGET', KEYS[2], field)
                    if not syncVal then
                        redis.call('HSET', KEYS[2], field, bufVal)
                    else
                        local okB, parsedB = pcall(cjson.decode, bufVal)
                        local okS, parsedS = pcall(cjson.decode, syncVal)
                        local validB = okB and type(parsedB) == 'table'
                        local validS = okS and type(parsedS) == 'table'
                        local tsB = validB and tonumber(parsedB.ts) or nil
                        local tsS = validS and tonumber(parsedS.ts) or nil
                        if (tsB and tsS and tsB >= tsS) or (tsB and not tsS) or (validB and not validS) or (validB and not tsB and not tsS) then
                            redis.call('HSET', KEYS[2], field, bufVal)
                        end
                    end
                end
                redis.call('DEL', KEYS[1])
                return 1
            end
            return 1
        `;
        const res = await client.eval(luaScript, {
            keys: [bufferKey, syncKey, lockKey],
            arguments: [lockToken, String(lockTtlMs)],
        });
        return res === 1 || res === "1";
    },
    async releaseLocationSyncLock(lockKey: string, lockToken: string): Promise<void> {
        if (!redisEnabled || !client.isOpen) return;
        const luaScript = `
            if redis.call('GET', KEYS[1]) == ARGV[1] then
                return redis.call('DEL', KEYS[1])
            end
            return 0
        `;
        await client.eval(luaScript, {
            keys: [lockKey],
            arguments: [lockToken],
        });
    },
    async rename(oldKey: string, newKey: string): Promise<boolean> {
        if (!redisEnabled || !client.isOpen) return false;
        try {
            await client.rename(oldKey, newKey);
            return true;
        } catch (error: any) {
            if (error.message && error.message.includes("no such key")) {
                return false;
            }
            throw error;
        }
    }
};

// Export a robust way to get a new client for subscriptions (Redis requires dedicated connection for sub)
export const createRedisClient = () => {
		return createClient({ url: redisUrl });
};

