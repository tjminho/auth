import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { hitLogin } from "@/lib/rate-limit";
import { UserStatus } from "@prisma/client";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { logger } from "@/lib/logger";
const SignInSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SignInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_INPUT", reason: "invalid" },
        { status: 400 }
      );
    }
    const { email, password } = parsed.data;
    // ✅ 로그인 시도 제한
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") ?? undefined;
    const limit = await hitLogin(ip, email);
    if (limit.limited) {
      logger.warn("로그인 시도 제한 초과", { email: maskEmail(email), ip, ua });
      return NextResponse.json(
        {
          error: "TOO_MANY_ATTEMPTS",
          reason: "rate_limited",
          remaining: limit.remaining,
          reset: limit.reset,
          count: limit.count,
        },
        { status: 429 }
      );
    }
    // ✅ 유저 조회
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      logger.warn("잘못된 로그인 시도", { email: maskEmail(email), ip, ua });
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", reason: "invalid" },
        { status: 401 }
      );
    }
    // ✅ 비밀번호 검증
    const ok = await compare(password, user.password);
    if (!ok) {
      logger.warn("비밀번호 불일치", { email: maskEmail(email), ip, ua });
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS", reason: "invalid" },
        { status: 401 }
      );
    }
    // ✅ 계정 상태 확인
    if (user.status !== UserStatus.ACTIVE) {
      logger.warn("비활성/정지 계정 로그인 시도", {
        email: maskEmail(email),
        status: user.status,
        ip,
      });
      return NextResponse.json(
        { error: "ACCOUNT_SUSPENDED", reason: "suspended" },
        { status: 403 }
      );
    }
    // ✅ 이메일 인증 여부 확인
    const isVerified = !!user.emailVerified;
    if (!isVerified) {
      const targetEmail = user.trustedEmail ?? user.email;
      if (targetEmail) {
        try {
          // ✅ 최근 발송 이력 확인 (쿨다운)
          const lastToken = await prisma.verification.findFirst({
            where: { identifier: targetEmail },
            orderBy: { createdAt: "desc" },
          });
          const now = Date.now();
          const lastSent = lastToken?.createdAt?.getTime() ?? 0;
          const COOLDOWN = 1000 * 60 * 2; // 2분
          if (now - lastSent > COOLDOWN) {
            await createAndEmailVerificationToken(user, targetEmail, {
              ip,
              ua,
            });
            logger.info("인증 메일 발송", {
              email: maskEmail(targetEmail),
              ip,
            });
          } else {
            logger.info("인증 메일 발송 스킵 (쿨다운)", {
              email: maskEmail(targetEmail),
              ip,
            });
          }
        } catch (e: any) {
          logger.error("인증 메일 발송 실패", {
            email: maskEmail(targetEmail),
            error: e?.message,
          });
        }
      }
      // ✅ verify 페이지로 이동할 수 있도록 URL 포함
      return NextResponse.json(
        {
          error: "EMAIL_NOT_VERIFIED",
          reason: "need_verify",
          url: `/auth/verify?email=${encodeURIComponent(targetEmail ?? "")}`,
        },
        { status: 403 }
      );
    }
    // ✅ NextAuth 세션 생성
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });
    if (!res?.ok) {
      logger.error("NextAuth signIn 실패", {
        email: maskEmail(email),
        error: String(res?.error),
      });
      return NextResponse.json(
        { error: res?.error || "SIGNIN_FAILED", reason: "invalid" },
        { status: 401 }
      );
    }
    logger.info("로그인 성공", { email: maskEmail(email), ip });
    return NextResponse.json({
      success: true,
      url: res.url || "/",
    });
  } catch (err: any) {
    logger.error("signin route error", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: "SERVER_ERROR", reason: "server_error" },
      { status: 500 }
    );
  }
}
// ✅ 이메일 로그 마스킹 유틸
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 2) + "***@" + domain;
}
