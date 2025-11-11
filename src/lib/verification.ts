"use server";

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import { VerificationType, UserStatus, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { addMinutes } from "date-fns";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";

/* ================================
   환경변수/상수
================================ */
const EMAIL_TTL_MIN = Number(process.env.EMAIL_TOKEN_TTL_MIN ?? 15);
const RESET_TTL_MIN = Number(process.env.PASSWORD_RESET_TTL_MIN ?? 30);
const SECRET = new TextEncoder().encode(process.env.EMAIL_TOKEN_SECRET!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const FROM_EMAIL = process.env.FROM_EMAIL!;
const RESEND_COOLDOWN_MS = Number(
  process.env.VERIFICATION_COOLDOWN_MS ?? 60_000
);
const DAILY_LIMIT = Number(process.env.VERIFICATION_DAILY_LIMIT ?? 10);

/* ================================
   타입/에러
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

export type VerifyResult = {
  code: VerifyErrorCode;
  email?: string;
  userId?: string;
  vid?: string;
  token?: string;
  resetUrl?: string;
  retryAfter?: number;
};

type TokenPayload = {
  vid: string;
  uid: string;
  type: VerificationType;
  val: string;
};

/* ================================
   유틸
================================ */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const maskedName =
    name.length <= 2 ? name[0] + "*" : name.slice(0, 2) + "***";
  return `${maskedName}@${domain}`;
}

async function signToken(
  payload: TokenPayload,
  ttlMin: number
): Promise<string> {
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlMin}m`)
    .sign(SECRET);
}

async function verifyToken(
  token: string
): Promise<{ payload?: TokenPayload; code?: VerifyErrorCode }> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { payload: payload as TokenPayload };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("exp") || msg.includes("expired"))
      return { code: "EXPIRED" };
    return { code: "INVALID_SIGNATURE" };
  }
}

/* ================================
   이메일 인증 발급
================================ */
export async function createAndEmailVerificationToken(
  user: User,
  targetEmailRaw: string
): Promise<VerifyResult> {
  if (!user?.id) return { code: "USER_ID_REQUIRED" };

  const targetEmail = normalizeEmail(targetEmailRaw);
  const expiresAt = addMinutes(new Date(), EMAIL_TTL_MIN);

  // 이미 인증된 계정
  if (
    user.emailVerified != null &&
    normalizeEmail(user.trustedEmail ?? "") === targetEmail
  ) {
    return { code: "ALREADY_VERIFIED", email: targetEmail, userId: user.id };
  }

  // Rate-limit / Daily-limit 체크
  const now = new Date();
  if (
    user.lastVerificationSentAt &&
    now.getTime() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    const retryAfter = Math.ceil(
      (RESEND_COOLDOWN_MS -
        (now.getTime() - user.lastVerificationSentAt.getTime())) /
        1000
    );
    return { code: "RATE_LIMITED", retryAfter };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCount = await prisma.verification.count({
    where: {
      userId: user.id,
      type: VerificationType.EMAIL,
      createdAt: { gte: todayStart },
    },
  });
  if (todayCount >= DAILY_LIMIT) {
    return { code: "DAILY_LIMIT_EXCEEDED" };
  }

  const { verification, session } = await prisma.$transaction(async (tx) => {
    await tx.verification.updateMany({
      where: {
        userId: user.id,
        type: VerificationType.EMAIL,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    await tx.verificationSession.deleteMany({
      where: { userId: user.id, verifiedAt: null },
    });

    const verification = await tx.verification.create({
      data: {
        identifier: targetEmail,
        userId: user.id,
        value: crypto.randomBytes(16).toString("hex"),
        type: VerificationType.EMAIL,
        expiresAt,
      },
    });
    const session = await tx.verificationSession.create({
      data: {
        userId: user.id,
        email: targetEmail,
        type: VerificationType.EMAIL,
        expiresAt,
      },
    });
    return { verification, session };
  });

  const payload: TokenPayload = {
    vid: session.vid,
    uid: user.id,
    type: VerificationType.EMAIL,
    val: verification.value,
  };
  const token = await signToken(payload, EMAIL_TTL_MIN);

  const verifyUrl = `${APP_URL}/auth/token-bridge?token=${encodeURIComponent(
    token
  )}&vid=${encodeURIComponent(session.vid)}`;

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
    return { code: "RESEND_FAILED" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });

  return {
    code: "EMAIL_SENT", // 기존 "VERIFIED" → "EMAIL_SENT"
    token,
    vid: session.vid,
    email: targetEmail,
    userId: user.id,
  };
}

/* ================================
   이메일 인증 검증
================================ */
export async function verifyEmailToken(
  token: string,
  queryVid?: string,
  req?: Request // ✅ 요청 객체 받아서 IP/UA 기록
): Promise<VerifyResult> {
  const { payload, code } = await verifyToken(token);
  if (code) return { code };
  if (!payload) return { code: "INVALID_SIGNATURE" };

  // vid 교차 검증
  if (queryVid && queryVid !== payload.vid) {
    logger.warn("vid mismatch", { queryVid, payloadVid: payload.vid });
    return { code: "INVALID_SIGNATURE" };
  }

  const [session, verification, user] = await Promise.all([
    prisma.verificationSession.findUnique({ where: { vid: payload.vid } }),
    prisma.verification.findFirst({
      where: {
        userId: payload.uid,
        type: VerificationType.EMAIL,
        value: payload.val,
        consumedAt: null,
      },
    }),
    prisma.user.findUnique({ where: { id: payload.uid } }),
  ]);

  if (!session || !verification) return { code: "NOT_FOUND" };
  if (!user) return { code: "USER_NOT_FOUND" };
  if (verification.expiresAt < new Date()) return { code: "EXPIRED" };
  if (session.verifiedAt) {
    return {
      code: "ALREADY_VERIFIED",
      email: session.email ?? user.trustedEmail ?? user.email ?? "",
      userId: user.id,
      vid: payload.vid,
    };
  }

  const identifier = normalizeEmail(verification.identifier);

  // ✅ 환경 정보 추출
  const ipHeader = req?.headers.get("x-forwarded-for") ?? "";
  const ip = ipHeader.split(",")[0].trim() || undefined;
  const ua = req?.headers.get("user-agent") ?? undefined;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        trustedEmail: identifier,
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

    await tx.verificationSession.update({
      where: { vid: session.vid },
      data: { verifiedAt: new Date() },
    });

    // ✅ VerifiedEmail 기록 (IP/UA 포함)
    await tx.verifiedEmail.upsert({
      where: { userId_email: { userId: user.id, email: identifier } },
      update: {
        verifiedAt: new Date(),
        ipAddress: ip,
        userAgent: ua,
      },
      create: {
        userId: user.id,
        email: identifier,
        verifiedAt: new Date(),
        ipAddress: ip,
        userAgent: ua,
      },
    });
  });

  // ✅ 감사 로그 기록
  await recordAuditLog(user.id, "EMAIL_VERIFIED", ip, ua);

  logger.info("이메일 인증 성공", {
    email: maskEmail(identifier),
    userId: user.id,
    vid: payload.vid,
    ip,
    ua,
  });

  return {
    code: "VERIFIED",
    email: identifier,
    userId: user.id,
    vid: payload.vid,
  };
}

/* ================================
   비밀번호 초기화 토큰 검증
================================ */
export async function verifyPasswordResetToken(
  token: string
): Promise<VerifyResult> {
  const { payload, code } = await verifyToken(token);
  if (code) return { code };
  if (!payload) return { code: "INVALID_SIGNATURE" };

  // ✅ 세션/토큰/사용자 조회
  const [session, verification, user] = await Promise.all([
    prisma.verificationSession.findUnique({
      where: { vid: payload.vid },
    }),
    prisma.verification.findFirst({
      where: {
        userId: payload.uid,
        type: VerificationType.PASSWORD_RESET,
        value: payload.val,
        consumedAt: null,
      },
    }),
    prisma.user.findUnique({ where: { id: payload.uid } }),
  ]);

  if (!session || !verification) {
    logger.warn("비밀번호 초기화 실패: 세션/토큰 불일치", {
      vid: payload.vid,
      uid: payload.uid,
    });
    return { code: "RESET_TOKEN_NOT_FOUND" };
  }
  if (!user) return { code: "USER_NOT_FOUND" };
  if (verification.expiresAt < new Date())
    return { code: "RESET_TOKEN_EXPIRED" };

  // ✅ 토큰 소비 처리
  await prisma.$transaction(async (tx) => {
    await tx.verification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });
    await tx.verificationSession.update({
      where: { vid: session.vid },
      data: { verifiedAt: new Date() },
    });
  });

  logger.info("비밀번호 초기화 토큰 검증 성공", {
    email: maskEmail(user.email ?? user.trustedEmail ?? ""),
    userId: user.id,
  });

  return {
    code: "VERIFIED",
    email: user.email ?? user.trustedEmail ?? "",
    userId: user.id,
    vid: payload.vid,
  };
}
