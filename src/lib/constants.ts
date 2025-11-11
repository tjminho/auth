/**
 * ✅ 인증 및 보안 관련 상수
 */

// 이메일 인증 토큰 유효 시간 (분)
export const EMAIL_TTL_MIN = 15;

// 비밀번호 재설정 토큰 유효 시간 (분)
export const RESET_TTL_MIN = 30;

// JWT 토큰 알고리즘
export const TOKEN_ALGORITHM = "HS256";

// JWT 발급자 (issuer)
export const TOKEN_ISSUER = "mzmon-auth";

/**
 * ✅ Rate-limit / 요청 제한 관련 상수
 * (세부 로직은 lib/rate-limit.ts에서 관리)
 */

// 이메일 인증 재요청 최소 쿨다운 (ms)
export const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000; // 1분

// 하루 최대 이메일 인증 요청 횟수
export const EMAIL_DAILY_LIMIT = 5;

// 로그인 시도 제한 (10분 동안 10회)
export const LOGIN_WINDOW_SECONDS = 600;
export const LOGIN_MAX_ATTEMPTS = 10;

// 기본 API 호출 제한 (1분 동안 5회)
export const API_WINDOW_SECONDS = 60;
export const API_MAX_REQUESTS = 5;

/**
 * ✅ 앱 공통 상수
 */

// 앱 기본 URL (환경변수 기반, fallback 제공)
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// 브랜드명
export const BRAND_NAME = "Mzmon";

// 고객센터 이메일
export const SUPPORT_EMAIL = "support@mzmon.com";
