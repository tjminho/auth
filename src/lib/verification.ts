"use server";

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { VerificationType, UserStatus, User } from "@prisma/client";
import { logger } from "@/lib/logger";
import { hit } from "@/lib/rate-limit";

// ===== 환경변수 =====
const TTL_MIN = Number(process.env.EMAIL_TOKEN_TTL_MIN ?? 15);
const RESEND_COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 10;
const SECRET = process.env.EMAIL_TOKEN_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const FROM_EMAIL = process.env.FROM_EMAIL!;

// ===== 에러 코드 타입 =====
export type VerifyErrorCode =
  | "USER_ID_REQUIRED"
  | "INVALID_EMAIL"
  | "DISPOSABLE_EMAIL_BLOCKED"
  | "ALREADY_VERIFIED"
  | "RATE_LIMITED"
  | "DAILY_LIMIT_EXCEEDED"
  | "RESEND_FAILED"
  | "INVALID_SIGNATURE"
  | "NOT_FOUND"
  | "ALREADY_USED"
  | "EXPIRED"
  | "USER_NOT_FOUND"
  | "EMAIL_MISMATCH"
  | "IP_MISMATCH"
  | "UA_MISMATCH"
  | "SIGNUP_TOKEN_INVALID"
  | "VERIFIED";

// ===== Custom Error =====
class VerifyError extends Error {
  code: VerifyErrorCode;
  retryAfter?: number;
  constructor(code: VerifyErrorCode, message?: string, retryAfter?: number) {
    super(message || code);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// ===== 토큰 페이로드 =====
type SignedPayload = {
  vid: string; // VerificationSession.vid
  uid: string;
  exp: number;
  ip?: string;
  ua?: string;
  st?: string;
};

// ===== 검증 결과 타입 =====
export type VerifyResult = {
  email: string;
  code: VerifyErrorCode;
  userId?: string;
  vid?: string;
};

// ===== 유틸 =====
function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function fromB64url(input: string): string {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64").toString();
}
function sign(payload: any): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}
function verify(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  if (sig !== expected) return null;
  try {
    return JSON.parse(fromB64url(body));
  } catch {
    return null;
  }
}
function hash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function isFormatValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
]);
function isDisposable(email: string): boolean {
  const domain = email.split("@")[1];
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

// ===== 내부 헬퍼: 발송 제한 체크 =====
async function assertResendAllowed(
  user: Pick<
    User,
    "id" | "lastVerificationSentAt" | "emailVerified" | "trustedEmail"
  >,
  email: string,
  ip?: string
) {
  if (user.emailVerified !== null && user.trustedEmail === email) {
    throw new VerifyError("ALREADY_VERIFIED");
  }

  const r = await hit(ip || "unknown", `email:${email}`);
  if (r.limited) {
    throw new VerifyError(
      "RATE_LIMITED",
      "Too many requests",
      r.retryAfter || r.reset || 60
    );
  }

  if (user.lastVerificationSentAt) {
    const elapsed = Date.now() - user.lastVerificationSentAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new VerifyError("RATE_LIMITED", "Cooldown active", retryAfter);
    }
  }

  const todayCount = await prisma.verification.count({
    where: {
      identifier: email,
      type: VerificationType.EMAIL,
      createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  if (todayCount >= DAILY_LIMIT) {
    throw new VerifyError("DAILY_LIMIT_EXCEEDED");
  }
}

// ===== 공개 API: 인증 토큰 생성 및 발송 =====
export async function createAndEmailVerificationToken(
  user: User,
  targetEmailRaw: string,
  meta?: { ip?: string; ua?: string; signupToken?: string }
): Promise<{ token: string; vid: string }> {
  if (!user?.id) throw new VerifyError("USER_ID_REQUIRED");

  const targetEmail = normalizeEmail(targetEmailRaw);
  if (!isFormatValidEmail(targetEmail)) throw new VerifyError("INVALID_EMAIL");
  if (targetEmail.endsWith("@placeholder.local") || isDisposable(targetEmail)) {
    throw new VerifyError("DISPOSABLE_EMAIL_BLOCKED");
  }

  await assertResendAllowed(
    {
      id: user.id,
      lastVerificationSentAt: user.lastVerificationSentAt,
      emailVerified: user.emailVerified,
      trustedEmail: user.trustedEmail,
    },
    targetEmail,
    meta?.ip
  );

  const expiresAt = addMinutes(new Date(), TTL_MIN);

  // ✅ Verification + VerificationSession 함께 생성
  const { verification, session } = await prisma.$transaction(async (tx) => {
    // 1. 기존 Verification 무효화
    await tx.verification.updateMany({
      where: {
        userId: user.id,
        type: VerificationType.EMAIL,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    // 2. 기존 VerificationSession 정리 (아직 인증 안 된 세션 제거)
    await tx.verificationSession.deleteMany({
      where: {
        userId: user.id,
        verifiedAt: null,
      },
    });

    // 3. 새 Verification 생성
    const verification = await tx.verification.create({
      data: {
        identifier: targetEmail,
        userId: user.id,
        value: crypto.randomBytes(16).toString("hex"),
        type: VerificationType.EMAIL,
        expiresAt,
      },
    });

    // 4. 새 VerificationSession 생성
    const session = await tx.verificationSession.create({
      data: {
        userId: user.id,
        expiresAt,
      },
    });

    return { verification, session };
  });

  const payload = {
    vid: session.vid, // ✅ VerificationSession.vid 사용
    uid: user.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
    ip: meta?.ip ? hash(meta.ip) : undefined,
    ua: meta?.ua ? hash(meta.ua) : undefined,
    st: meta?.signupToken ? hash(meta.signupToken) : undefined,
  };
  const signed = sign(payload);

  const query = new URLSearchParams({
    email: targetEmail,
    token: signed,
    vid: session.vid, // ✅ 메일 링크에도 session.vid
  });
  const verifyUrl = `${APP_URL}/auth/token-bridge?${query.toString()}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: targetEmail,
      subject: "이메일 인증을 완료해주세요",
      react: VerifyEmailTemplate({ verifyUrl }),
    });
  } catch (err: any) {
    await prisma.verification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });
    logger.error("메일 발송 실패", {
      email: targetEmail,
      userId: user.id,
      message: err?.message,
      stack: err?.stack,
    });
    throw new VerifyError("RESEND_FAILED");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });

  logger.info("인증 메일 발송 완료", {
    email: targetEmail,
    userId: user.id,
    ip: meta?.ip,
    ua: meta?.ua,
    signupToken: meta?.signupToken ? "***" : undefined,
  });

  return { token: signed, vid: session.vid }; // ✅ session.vid도 함께 반환
}
export async function verifyEmailByValueToken(
  token: string,
  opts?: { ip?: string; ua?: string; signupToken?: string }
): Promise<VerifyResult | null> {
  try {
    const payload = verify(token);
    if (!payload) return { email: "", code: "INVALID_SIGNATURE" };
    if (payload.exp * 1000 < Date.now()) return { email: "", code: "EXPIRED" };

    const verification = await prisma.verification.findFirst({
      where: { userId: payload.uid, type: VerificationType.EMAIL },
      orderBy: { createdAt: "desc" },
    });
    if (!verification) return { email: "", code: "NOT_FOUND" };
    if (verification.consumedAt)
      return { email: verification.identifier, code: "ALREADY_USED" };
    if (verification.expiresAt < new Date())
      return { email: verification.identifier, code: "EXPIRED" };

    // IP/UA 바인딩 검증
    if (payload.ip && payload.ip !== hash(opts?.ip || "")) {
      return { email: verification.identifier, code: "IP_MISMATCH" };
    }
    if (payload.ua && payload.ua !== hash(opts?.ua || "")) {
      return { email: verification.identifier, code: "UA_MISMATCH" };
    }
    if (payload.st && payload.st !== hash(opts?.signupToken || "")) {
      return { email: verification.identifier, code: "SIGNUP_TOKEN_INVALID" };
    }

    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user)
      return { email: verification.identifier, code: "USER_NOT_FOUND" };

    const normalizedIdentifier = normalizeEmail(verification.identifier);
    const matches =
      normalizeEmail(user.email || "") === normalizedIdentifier ||
      normalizeEmail(user.trustedEmail || "") === normalizedIdentifier;
    if (!matches) {
      return { email: verification.identifier, code: "EMAIL_MISMATCH" };
    }

    // ✅ DB 업데이트
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          trustedEmail: normalizedIdentifier,
          emailVerified: new Date(),
          ...(user.status !== UserStatus.SUSPENDED
            ? { status: UserStatus.ACTIVE }
            : {}),
        },
      });
      await tx.verification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      });
      await tx.verificationSession.updateMany({
        where: { vid: payload.vid },
        data: { verifiedAt: new Date() },
      });
    });

    logger.info("이메일 인증 성공", {
      email: normalizedIdentifier,
      userId: user.id,
      ip: opts?.ip,
      ua: opts?.ua,
    });

    return {
      email: normalizedIdentifier,
      code: "VERIFIED",
      userId: user.id,
      vid: payload.vid,
    };
  } catch (err: any) {
    logger.error("이메일 인증 처리 중 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return null;
  }
}
