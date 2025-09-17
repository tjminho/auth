import { Redis } from "@upstash/redis";

type WindowConfig = {
  windowSeconds: number; // 윈도우 길이
  max: number; // 허용 요청 수
  prefix?: string; // 키 prefix
};

export class RateLimiter {
  private redis: Redis;
  private cfg: WindowConfig;

  constructor(cfg: WindowConfig) {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    this.cfg = { prefix: "rl", ...cfg };
  }

  // Sliding window counter (초 단위 버킷)
  async check(key: string) {
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `${this.cfg.prefix}:${key}:${Math.floor(
      now / this.cfg.windowSeconds
    )}`;
    const expire = this.cfg.windowSeconds * 2;

    const pipeline = this.redis.pipeline();
    pipeline.incr(bucketKey);
    pipeline.expire(bucketKey, expire);
    const [count] = (await pipeline.exec()) as [number, unknown];

    const allowed = (count as number) <= this.cfg.max;
    const remaining = Math.max(this.cfg.max - (count as number), 0);
    const reset =
      (Math.floor(now / this.cfg.windowSeconds) + 1) * this.cfg.windowSeconds -
      now;

    return { allowed, remaining, reset };
  }
}
