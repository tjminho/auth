import { Redis } from "@upstash/redis";

const ttl = Number(process.env.SESSION_CACHE_TTL ?? 900);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const sessionCache = {
  async get<T = any>(key: string): Promise<T | null> {
    try {
      return (await redis.get<T>(key)) ?? null;
    } catch {
      return null;
    }
  },
  async set<T = any>(key: string, value: T, seconds = ttl) {
    try {
      await redis.set(key, value, { ex: seconds });
    } catch {
      // noop
    }
  },
  async del(key: string) {
    try {
      await redis.del(key);
    } catch {
      // noop
    }
  },
};
