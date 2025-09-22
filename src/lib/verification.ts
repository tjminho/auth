"use server";

import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { VerifyEmailTemplate } from "@/lib/email-template";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { VerificationType, UserStatus } from "@prisma/client";
import { logger } from "@/lib/logger";

const TTL_MIN = Number(process.env.EMAIL_TOKEN_TTL_MIN ?? 15);
const RESEND_COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 10; // 하루 최대 발송 횟수
const SECRET = process.env.EMAIL_TOKEN_SECRET;
const BIND_IP = (process.env.EMAIL_TOKEN_BIND_IP ?? "false") === "true";
const BIND_UA = (process.env.EMAIL_TOKEN_BIND_UA ?? "true") === "true"; // UA 바인딩 옵션

if (!SECRET)
  throw new Error("EMAIL_TOKEN_SECRET 환경 변수가 설정되지 않았습니다.");

type SignedPayload = {
  vid: string;
  uid: string;
  exp: number;
  ip?: string;
  ua?: string;
};

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(payload: SignedPayload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto
    .createHmac("sha256", SECRET!)
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
    .createHmac("sha256", SECRET!)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64").toString());
  } catch {
    return null;
  }
}

/**
 * 인증 토큰 생성 및 발송
 */
export async function createAndEmailVerificationToken(
  email: string,
  meta?: { ip?: string; ua?: string }
) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ trustedEmail: email }, { email }] },
  });
  if (!user) throw new Error("해당 이메일의 사용자가 없습니다.");

  // 쿨다운 체크
  if (
    user.lastVerificationSentAt &&
    Date.now() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new Error("잠시 후 다시 시도해주세요.");
  }

  // 하루 발송 횟수 제한
  const todayCount = await prisma.verification.count({
    where: {
      identifier: email,
      type: VerificationType.EMAIL,
      createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });
  if (todayCount >= DAILY_LIMIT) {
    throw new Error("오늘은 더 이상 인증 메일을 발송할 수 없습니다.");
  }

  // 기존 토큰 무효화
  await prisma.verification.updateMany({
    where: {
      identifier: email,
      type: VerificationType.EMAIL,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  const expiresAt = addMinutes(new Date(), TTL_MIN);
  const verification = await prisma.verification.create({
    data: {
      identifier: email,
      value: crypto.randomBytes(16).toString("hex"),
      type: VerificationType.EMAIL,
      expiresAt,
    },
  });

  const payload: SignedPayload = {
    vid: verification.id,
    uid: user.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
    ip: BIND_IP ? meta?.ip?.split(",")[0]?.trim() : undefined,
    ua: BIND_UA ? meta?.ua : undefined,
  };

  const signed = sign(payload);
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/token-bridge?email=${encodeURIComponent(
    email
  )}&token=${signed}`;

  await resend.emails.send({
    from: process.env.FROM_EMAIL!,
    to: email,
    subject: "이메일 인증을 완료해주세요",
    react: VerifyEmailTemplate({ verifyUrl }),
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastVerificationSentAt: new Date() },
  });

  logger.info("인증 메일 발송 완료", { email, ip: meta?.ip, ua: meta?.ua });
  return signed;
}

/**
 * 이메일 인증 토큰 검증 및 소비 처리
 */
export async function verifyEmailByValueToken(
  token: string,
  opts?: { ip?: string; ua?: string }
): Promise<string | null> {
  try {
    const payload = verify(token);
    if (!payload) {
      logger.warn("이메일 인증 실패: 서명 검증 실패", { token });
      return null;
    }

    if (payload.exp * 1000 < Date.now()) {
      logger.warn("이메일 인증 실패: 토큰 만료", { token });
      return null;
    }

    if (
      BIND_IP &&
      payload.ip &&
      opts?.ip?.split(",")[0]?.trim() !== payload.ip
    ) {
      logger.warn("이메일 인증 실패: IP 불일치", { token });
      return null;
    }

    if (BIND_UA && payload.ua && opts?.ua && opts.ua !== payload.ua) {
      logger.warn("이메일 인증 실패: UA 불일치", { token });
      return null;
    }

    const verification = await prisma.verification.findUnique({
      where: { id: payload.vid },
    });

    if (!verification) {
      logger.warn("이메일 인증 실패: 토큰 없음", { token });
      return null;
    }

    if (verification.consumedAt) {
      logger.warn("이메일 인증 실패: 이미 사용된 토큰", { token });
      return null;
    }

    if (verification.type !== VerificationType.EMAIL) {
      logger.warn("이메일 인증 실패: 타입 불일치", { token });
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
    });

    if (!user) {
      logger.warn("이메일 인증 실패: 유저 없음", {
        email: verification.identifier,
      });
      return null;
    }

    if (!user.emailVerified || user.status !== UserStatus.ACTIVE) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          status: UserStatus.ACTIVE,
        },
      });
    }

    await prisma.verification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });

    logger.info("이메일 인증 성공", {
      email: verification.identifier,
      ip: opts?.ip,
      ua: opts?.ua,
    });

    return verification.identifier;
  } catch (err) {
    logger.error("이메일 인증 처리 중 오류", { err });
    return null;
  }
}
