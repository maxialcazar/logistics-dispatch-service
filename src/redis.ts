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

export const redis = {
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
	async delPrefix(prefix: string) {
		if (!redisEnabled || !client.isOpen) return;
		const keys = await client.keys(`${prefix}*`);
		if (keys.length > 0) {
			await client.del(keys);
		}
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
	}
};

// Export a robust way to get a new client for subscriptions (Redis requires dedicated connection for sub)
export const createRedisClient = () => {
		return createClient({ url: redisUrl });
};

