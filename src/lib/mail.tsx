import * as React from "react";
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import {
  VerifyEmailTemplate,
  PasswordResetTemplate,
  LoginAlertTemplate,
} from "@/lib/email-template";
import { APP_URL, SUPPORT_EMAIL } from "@/lib/constants";

const resend = new Resend(process.env.RESEND_API_KEY || "");
const FROM_EMAIL = process.env.FROM_EMAIL || SUPPORT_EMAIL || "no-reply@mzmon.com";

/**
 * ✅ 공통 메일 발송 함수
 */
async function sendMail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      react,
    });

    if (error) {
      logger.error("메일 발송 실패", { to, subject, error: String(error) });
      throw new Error(`MAIL_SEND_FAILED: ${String(error)}`);
    }

    logger.info("메일 발송 성공", { to, subject, id: data?.id });
    return { success: true, id: data?.id };
  } catch (err: any) {
    logger.error("메일 발송 중 오류", { to, subject, error: err?.message });
    throw new Error(`MAIL_SEND_FAILED: ${err?.message}`);
  }
}

/**
 * ✅ 이메일 인증 메일 발송
 */
export async function sendVerificationEmail(email: string, token: string, vid: string) {
  const verifyUrl = `${APP_URL}/auth/token-bridge?token=${encodeURIComponent(
    token
  )}&vid=${encodeURIComponent(vid)}&email=${encodeURIComponent(email)}`;

  return await sendMail({
    to: email,
    subject: "이메일 인증을 완료해주세요",
    react: <VerifyEmailTemplate verifyUrl={verifyUrl} />,
  });
}

/**
 * ✅ 비밀번호 재설정 메일 발송
 */
export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;

  return await sendMail({
    to: email,
    subject: "비밀번호 재설정 안내",
    react: <PasswordResetTemplate resetUrl={resetUrl} />,
  });
}

/**
 * ✅ 새로운 기기/위치 로그인 알림 메일
 */
export async function sendLoginAlertEmail(
  email: string,
  { ip, userAgent, location }: { ip: string; userAgent: string; location?: string | null }
) {
  return await sendMail({
    to: email,
    subject: "새로운 기기에서 로그인되었습니다",
    react: <LoginAlertTemplate ip={ip} userAgent={userAgent} location={location} />,
  });
}