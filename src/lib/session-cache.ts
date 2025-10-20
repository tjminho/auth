import { Redis } from "@upstash/redis";
if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  throw new Error("Upstash Redis 환경변수가 설정되지 않았습니다.");
}
const ttl = Number(process.env.SESSION_CACHE_TTL ?? 900);
const prefix = process.env.SESSION_CACHE_PREFIX ?? "session:";
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const fullKey = (key: string) => `${prefix}${key}`;
export const sessionCache = {
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const data = await redis.get<string>(fullKey(key));
      return data ? (JSON.parse(data) as T) : null;
    } catch (err) {
      console.error("Redis GET 에러:", err);
      return null;
    }
  },
  async set<T = any>(key: string, value: T, seconds = ttl) {
    try {
      await redis.set(fullKey(key), JSON.stringify(value), { ex: seconds });
    } catch (err) {
      console.error("Redis SET 에러:", err);
    }
  },
  async del(key: string) {
    try {
      await redis.del(fullKey(key));
    } catch (err) {
      console.error("Redis DEL 에러:", err);
    }
  },
};
