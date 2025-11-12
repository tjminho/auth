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

/**
 * 모든 응답에 공통적으로 포함될 수 있는 필드
 * - message는 선택적으로 항상 허용
 */
type VerifyBase = {
  email?: string;
  vid?: string;
  userId?: string;
  message?: string;
};

/* ================================
   응답 타입 정의
================================ */
export type VerifyResult =
  | (VerifyBase & { code: "EXPIRED" })
  | (VerifyBase & { code: "INVALID_SIGNATURE" })
  | (VerifyBase & { code: "NOT_FOUND" })
  | (VerifyBase & { code: "USER_NOT_FOUND" })
  | (VerifyBase & { code: "RATE_LIMITED"; retryAfter: number })
  | (VerifyBase & { code: "DAILY_LIMIT_EXCEEDED"; retryAfter?: number })
  | (VerifyBase & { code: "INVALID_EMAIL" })
  | (VerifyBase & { code: "RESEND_FAILED" })
  | (VerifyBase & {
      code: "EMAIL_SENT";
      vid: string;
      email: string;
      userId: string;
    })
  | (VerifyBase & {
      code: "VERIFIED";
      email: string;
      userId: string;
      vid: string;
    })
  | (VerifyBase & {
      code: "ALREADY_VERIFIED";
      email: string;
      userId: string;
    })
  | { code: "RESET_TOKEN_NOT_FOUND"; token: string; message?: string }
  | { code: "RESET_TOKEN_EXPIRED"; token: string; message?: string }
  | { code: "USER_ID_REQUIRED"; message?: string };

/* ================================
   토큰 페이로드 정의
================================ */
export type TokenPayload = {
  vid: string;
  uid: string;
  type: VerificationType;
  val: string;
};
