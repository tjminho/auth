"use server";

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import { VerificationType, UserStatus, User } from "@prisma/client";
import type {
  VerifyErrorCode,
  VerifyResult,
  TokenPayload,
} from "@/lib/verification-types";
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
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL!;
const RESEND_COOLDOWN_MS = Number(
  process.env.VERIFICATION_COOLDOWN_MS ?? 60_000
);
const DAILY_LIMIT = Number(process.env.VERIFICATION_DAILY_LIMIT ?? 10);

/* ================================
   유틸
================================ */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

/**
 * 헬퍼는 VerifyResult가 아니라, 페이로드/간단 코드만 반환합니다.
 * 라우팅 함수에서 VerifyResult로 매핑합니다.
 */
type RawVerify = {
  payload?: TokenPayload;
  code?: Exclude<
    VerifyErrorCode,
    "VERIFIED" | "ALREADY_VERIFIED" | "EMAIL_SENT"
  >;
};

async function verifyToken(token: string): Promise<RawVerify> {
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
  if (!user?.id) return { success: false, code: "USER_ID_REQUIRED" };

  const targetEmail = normalizeEmail(targetEmailRaw);
  if (!isEmailValid(targetEmail)) {
    return { success: false, code: "INVALID_EMAIL", email: targetEmail };
  }

  if (!FROM_EMAIL || !APP_URL || !RESEND_API_KEY) {
    logger.error(
      "환경 변수 미설정: FROM_EMAIL, APP_URL 또는 RESEND_API_KEY 없음"
    );
    return { success: false, code: "RESEND_FAILED", email: targetEmail };
  }

  const expiresAt = addMinutes(new Date(), EMAIL_TTL_MIN);

  // 이미 인증된 계정
  if (
    user.emailVerified != null &&
    (normalizeEmail(user.trustedEmail ?? "") === targetEmail ||
      normalizeEmail(user.email ?? "") === targetEmail)
  ) {
    return {
      success: true,
      code: "ALREADY_VERIFIED",
      email: targetEmail,
      userId: user.id,
    };
  }

  // Rate-limit 체크
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
    return {
      success: false,
      code: "RATE_LIMITED",
      retryAfter,
      email: targetEmail,
    };
  }

  // Daily-limit 체크
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
    return { success: false, code: "DAILY_LIMIT_EXCEEDED", email: targetEmail };
  }

  // 기존 토큰/세션 정리 후 새로 생성
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
    logger.error("메일 발송 실패", { error: err?.message });
    await prisma.$transaction(async (tx) => {
      await tx.verification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      });
      await tx.verificationSession.delete({ where: { vid: session.vid } });
    });
    return { success: false, code: "RESEND_FAILED", email: targetEmail };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });

  // ✅ 최종 응답: EMAIL_SENT 케이스
  return {
    success: true,
    code: "EMAIL_SENT",
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
  req?: Request
): Promise<VerifyResult> {
  const { payload, code } = await verifyToken(token);
  if (code) return { code } as VerifyResult; // EXPIRED / INVALID_SIGNATURE

  if (!payload) return { code: "INVALID_SIGNATURE" };

  // vid 교차 검증
  if (queryVid && queryVid !== payload.vid) {
    logger.warn("vid mismatch", { queryVid, payloadVid: payload.vid });
    return { code: "INVALID_SIGNATURE", vid: queryVid };
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

  if (!session || !verification) return { code: "NOT_FOUND", vid: payload.vid };
  if (!user) return { code: "USER_NOT_FOUND", vid: payload.vid };
  if (verification.expiresAt < new Date())
    return { code: "EXPIRED", vid: payload.vid };

  if (session.verifiedAt) {
    return {
      code: "ALREADY_VERIFIED",
      email: session.email ?? user.trustedEmail ?? user.email ?? "",
      userId: user.id,
      vid: payload.vid,
    };
  }

  const identifier = normalizeEmail(verification.identifier);

  // 환경 정보 추출
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
/* ================================
   비밀번호 초기화 토큰 검증
================================ */
export async function verifyPasswordResetToken(
  token: string
): Promise<VerifyResult> {
  const { payload, code } = await verifyToken(token);

  // 토큰 검증 단계에서 발생하는 에러 처리
  if (code === "EXPIRED") {
    return { code: "EXPIRED" };
  }
  if (code === "INVALID_SIGNATURE") {
    return { code: "INVALID_SIGNATURE" };
  }

  // payload가 없으면 잘못된 서명 처리
  if (!payload) {
    return { code: "INVALID_SIGNATURE" };
  }

  // DB 조회
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

  // 세션/토큰 불일치
  if (!session || !verification) {
    logger.warn("비밀번호 초기화 실패: 세션/토큰 불일치", {
      vid: payload.vid,
      uid: payload.uid,
    });
    return { code: "RESET_TOKEN_NOT_FOUND", token: payload.val };
  }

  // 사용자 없음
  if (!user) {
    return { code: "USER_NOT_FOUND", vid: payload.vid };
  }

  // 토큰 만료
  if (verification.expiresAt < new Date()) {
    return { code: "RESET_TOKEN_EXPIRED", token: payload.val };
  }

  // 토큰 소비 처리
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
