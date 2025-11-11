import { Redis } from "@upstash/redis";
import crypto from "crypto";
import { logger } from "@/lib/logger";
import { EMAIL_RESEND_COOLDOWN_MS, EMAIL_DAILY_LIMIT } from "@/lib/constants";

type WindowConfig = {
  windowSeconds: number; // 윈도우 길이
  max: number; // 허용 요청 수
  prefix?: string; // 키 prefix
};

// ✅ Redis 클라이언트 싱글톤 관리
let redisClient: Redis | null = null;
function getRedis() {
  if (!redisClient) {
    if (
      !process.env.UPSTASH_REDIS_REST_URL ||
      !process.env.UPSTASH_REDIS_REST_TOKEN
    ) {
      logger.error("Upstash Redis 환경 변수가 설정되지 않았습니다.");
      throw new Error("Upstash Redis 환경 변수가 설정되지 않았습니다.");
    }
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

export class RateLimiter {
  private redis: Redis;
  private cfg: WindowConfig;

  constructor(cfg: WindowConfig) {
    this.redis = getRedis();
    this.cfg = { prefix: "rl", ...cfg };
  }

  /**
   * ✅ Sliding window counter (초 단위 버킷)
   * - Redis 장애 시 fallback 허용
   * - count, remaining, reset, retryAfter 값 반환
   */
  async check(key: string) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(now / this.cfg.windowSeconds);
      const bucketKey = `${this.cfg.prefix}:${key}:${bucket}`;
      const expire = this.cfg.windowSeconds * 2;

      const pipeline = this.redis.pipeline();
      pipeline.incr(bucketKey);
      pipeline.expire(bucketKey, expire);
      const results = (await pipeline.exec()) as [string, number][];

      const count = (results?.[0]?.[1] as number) ?? 0;
      const allowed = count <= this.cfg.max;
      const remaining = Math.max(this.cfg.max - count, 0);
      const reset = (bucket + 1) * this.cfg.windowSeconds - now;

      return {
        allowed,
        remaining,
        reset,
        count,
        limit: this.cfg.max,
        retryAfter: allowed ? 0 : reset,
      };
    } catch (err) {
      logger.error("RateLimiter check 실패", {
        error: (err as Error)?.message,
      });
      // Redis 장애 시 서비스는 계속 동작하도록 fallback 허용
      return {
        allowed: true,
        remaining: this.cfg.max,
        reset: this.cfg.windowSeconds,
        count: 0,
        limit: this.cfg.max,
        retryAfter: 0,
      };
    }
  }
}

// ===== 공통 유틸: 안전한 키 생성 =====
function safeKey(...parts: string[]) {
  const salt = process.env.RATE_LIMIT_SALT || "";
  return crypto
    .createHash("sha256")
    .update(parts.join(":") + salt)
    .digest("hex");
}

// ===== 기본 API 제한 (IP + key 기준) =====
const defaultLimiter = new RateLimiter({
  windowSeconds: 60,
  max: 5,
  prefix: "rl",
});
export async function hit(ip: string, key: string) {
  return defaultLimiter.check(safeKey(ip, key));
}

// ===== 로그인 전용 제한 (IP + 이메일 기준) =====
const loginLimiter = new RateLimiter({
  windowSeconds: 600,
  max: 10,
  prefix: "login",
});
export async function hitLogin(ip: string, email: string) {
  return loginLimiter.check(safeKey(ip, email.toLowerCase()));
}

// ===== 이메일 발송 전용 제한 (IP + 이메일 기준) =====
const emailLimiter = new RateLimiter({
  windowSeconds: EMAIL_RESEND_COOLDOWN_MS / 1000, // constants.ts 연동
  max: EMAIL_DAILY_LIMIT,
  prefix: "email",
});
export async function hitEmail(ip: string, email: string) {
  return emailLimiter.check(safeKey(ip, email.toLowerCase()));
}
