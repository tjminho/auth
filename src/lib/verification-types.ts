// lib/verification-types.ts
import { VerificationType } from "@prisma/client";

/* ================================
   타입/에러 코드 정의
================================ */
export type VerifyErrorCode =
  | "USER_ID_REQUIRED"
  | "INVALID_EMAIL"
  | "RESEND_FAILED"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_FOUND"
  | "USER_NOT_FOUND"
  | "EMAIL_SENT"
  | "RESET_TOKEN_NOT_FOUND"
  | "RESET_TOKEN_EXPIRED"
  | "ALREADY_VERIFIED"
  | "RATE_LIMITED"
  | "DAILY_LIMIT_EXCEEDED"
  | "VERIFIED";

/* ================================
   공통 응답 필드 정의
================================ */
export interface VerifyBase {
  success: boolean; // ✅ 필수로 변경
  code: VerifyErrorCode; // ✅ 모든 응답에 코드 포함
  message?: string;
  email?: string;
  vid?: string;
  userId?: string;
  retryAfter?: number; // Rate-limit 관련
  token?: string; // Reset-token 관련
}

/* ================================
   응답 타입 정의
   - 모든 응답은 VerifyBase 기반
================================ */
export type VerifyResult = VerifyBase;

/* ================================
   토큰 페이로드 정의
================================ */
export type TokenPayload = {
  vid: string;
  uid: string;
  type: VerificationType;
  val: string;
};
