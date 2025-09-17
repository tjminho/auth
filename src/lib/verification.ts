"use server";

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { VerificationType } from "@prisma/client";

const TTL_MIN = 15; // 토큰 유효 시간(분)
const RESEND_COOLDOWN_MS = 60_000; // 재발송 쿨다운(1분)

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * 인증 토큰 생성 및 발송
 * - trustedEmail 우선, 없으면 email로도 허용
 * - 기존 토큰 삭제, 쿨다운 적용, 발송 시각 업데이트
 */
export async function createAndEmailVerificationToken(email: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ trustedEmail: email }, { email }] },
  });
  if (!user) throw new Error("해당 이메일의 사용자가 없습니다.");

  if (
    user.lastVerificationSentAt &&
    Date.now() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new Error("잠시 후 다시 시도해주세요.");
  }

  const value = sha256(crypto.randomBytes(32).toString("hex"));
  const expiresAt = addMinutes(new Date(), TTL_MIN);

  // 기존 토큰 정리
  await prisma.verification.deleteMany({
    where: { identifier: email, type: VerificationType.EMAIL },
  });

  // 새 토큰 저장
  await prisma.verification.create({
    data: { identifier: email, value, type: VerificationType.EMAIL, expiresAt },
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/token-bridge?email=${encodeURIComponent(
    email
  )}&token=${value}`;

  // 이메일 발송
  await resend.emails.send({
    from: "no-reply@ainosm.com",
    to: email,
    subject: "이메일 인증을 완료해주세요",
    react: VerifyEmailTemplate({ verifyUrl }),
  });

  // 발송 시각 기록
  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });

  return value;
}

/**
 * 토큰 값으로 이메일 인증 처리
 * - 토큰 만료/유효성 검사
 * - User.emailVerified/status 업데이트
 * - VerifiedEmail 이력 저장
 * - 토큰 삭제
 */
export async function verifyEmailByValueToken(
  value: string,
  meta?: { ip?: string; ua?: string }
) {
  const token = await prisma.verification.findUnique({ where: { value } });
  if (!token) return null;

  const now = new Date();
  if (token.type !== VerificationType.EMAIL || token.expiresAt < now) {
    await prisma.verification.deleteMany({ where: { value } });
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ trustedEmail: token.identifier }, { email: token.identifier }],
    },
  });
  if (!user) {
    await prisma.verification.deleteMany({ where: { value } });
    return null;
  }

  const ip = meta?.ip?.split(",")[0]?.trim();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { emailVerified: now, status: "ACTIVE" },
    });

    await tx.verifiedEmail.upsert({
      where: { email: token.identifier },
      update: {
        verifiedAt: now,
        ipAddress: ip,
        userAgent: meta?.ua,
      },
      create: {
        email: token.identifier,
        userId: user.id,
        verifiedAt: now,
        ipAddress: ip,
        userAgent: meta?.ua,
      },
    });

    await tx.verification.deleteMany({ where: { value } });
  });

  return token.identifier;
}
