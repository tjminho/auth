"use server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { VerificationType, UserStatus, User } from "@prisma/client";
import { logger } from "@/lib/logger";
// 환경변수
const TTL_MIN = Number(process.env.EMAIL_TOKEN_TTL_MIN ?? 15);
const RESEND_COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 10;
const SECRET = process.env.EMAIL_TOKEN_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const FROM_EMAIL = process.env.FROM_EMAIL;
if (!SECRET || !APP_URL || !FROM_EMAIL) {
  throw new Error("필수 환경변수가 누락되었습니다.");
}
// 타입
type SignedPayload = {
  vid: string;
  uid: string;
  exp: number;
};
// 유틸
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
function sign(payload: SignedPayload): string {
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
function verify(token: string): SignedPayload | null {
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
function isRealEmail(email: string): boolean {
  if (!email || email.endsWith("@placeholder.local")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// ✅ 인증 토큰 생성 및 발송
export async function createAndEmailVerificationToken(
  user: User,
  targetEmail: string,
  meta?: { ip?: string; ua?: string; vid?: string }
): Promise<string> {
  if (!user?.id) {
    throw new Error("USER_ID_REQUIRED");
  }
  if (!targetEmail || !isRealEmail(targetEmail)) {
    throw new Error("INVALID_EMAIL");
  }
  // 쿨다운 체크
  if (
    user.lastVerificationSentAt &&
    Date.now() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new Error("RATE_LIMITED");
  }
  // 하루 발송 횟수 제한
  const todayCount = await prisma.verification.count({
    where: {
      identifier: targetEmail,
      type: VerificationType.EMAIL,
      createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  if (todayCount >= DAILY_LIMIT) {
    throw new Error("DAILY_LIMIT_EXCEEDED");
  }
  const expiresAt = addMinutes(new Date(), TTL_MIN);
  // 기존 토큰 무효화 + 새 토큰 생성
  const verification = await prisma.$transaction(async (tx) => {
    await tx.verification.updateMany({
      where: {
        userId: user.id,
        type: VerificationType.EMAIL,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    return tx.verification.create({
      data: {
        identifier: targetEmail,
        userId: user.id, // ✅ 반드시 포함
        value: crypto.randomBytes(16).toString("hex"),
        type: VerificationType.EMAIL,
        expiresAt,
      },
    });
  });
  const payload: SignedPayload = {
    vid: verification.id,
    uid: user.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const signed = sign(payload);
  // ✅ 링크 생성 시 vid 포함
  const query = new URLSearchParams({
    email: targetEmail,
    token: signed,
  });
  if (meta?.vid) query.set("vid", meta.vid);
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
      message: err?.message,
      stack: err?.stack,
    });
    throw new Error("RESEND_FAILED");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });
  logger.info("인증 메일 발송 완료", {
    email: targetEmail,
    ip: meta?.ip,
    ua: meta?.ua,
    vid: meta?.vid,
  });
  return signed;
}
// ✅ 이메일 인증 토큰 검증 및 소비 처리
export async function verifyEmailByValueToken(
  token: string,
  opts?: { ip?: string; ua?: string }
): Promise<{ email: string; code: string } | null> {
  try {
    const payload = verify(token);
    if (!payload) {
      logger.warn("이메일 인증 실패: 서명 검증 실패");
      return { email: "", code: "INVALID_SIGNATURE" };
    }
    if (payload.exp * 1000 < Date.now()) {
      logger.warn("이메일 인증 실패: 토큰 만료");
      return { email: "", code: "EXPIRED" };
    }
    const verification = await prisma.verification.findUnique({
      where: { id: payload.vid },
    });
    if (!verification || verification.type !== VerificationType.EMAIL) {
      logger.warn("이메일 인증 실패: 토큰 없음/타입 불일치");
      return { email: "", code: "NOT_FOUND" };
    }
    if (verification.consumedAt) {
      logger.warn("이메일 인증 실패: 이미 사용된 토큰");
      return { email: verification.identifier, code: "ALREADY_USED" };
    }
    if (verification.expiresAt < new Date()) {
      logger.warn("이메일 인증 실패: DB 만료");
      return { email: verification.identifier, code: "EXPIRED" };
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
    });
    if (!user) {
      logger.warn("이메일 인증 실패: 유저 없음", {
        email: verification.identifier,
      });
      return { email: verification.identifier, code: "USER_NOT_FOUND" };
    }
    // 유저 이메일 매칭 검증
    if (
      user.email !== verification.identifier &&
      user.trustedEmail !== verification.identifier
    ) {
      logger.warn("이메일 인증 실패: 이메일 불일치", {
        expected: verification.identifier,
        actual: user.email,
      });
      return { email: verification.identifier, code: "EMAIL_MISMATCH" };
    }
    // ✅ trustedEmail 업데이트 + 토큰 소비
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          trustedEmail: verification.identifier,
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
    });
    logger.info("이메일 인증 성공", {
      email: verification.identifier,
      ip: opts?.ip,
      ua: opts?.ua,
    });
    return { email: verification.identifier, code: "VERIFIED" };
  } catch (err: any) {
    logger.error("이메일 인증 처리 중 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return null;
  }
}
