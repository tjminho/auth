import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { signupSchema } from "@/lib/validation";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { UserStatus } from "@prisma/client";
import { hit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // 1. 입력값 검증
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const firstError =
        parsed.error.flatten().formErrors[0] ?? "잘못된 입력값입니다.";
      return NextResponse.json(
        { error: "INVALID_INPUT", message: firstError, reason: "invalid" },
        { status: 400 }
      );
    }
    const { email, password, name } = parsed.data;
    // 2. 요청 제한 (IP + 이메일 기준)
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") ?? undefined;
    const limit = await hit(ip, email);
    if (limit.limited) {
      logger.warn("회원가입 요청 제한 초과", { email, ip, ua });
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          reason: "rate_limited",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          remaining: limit.remaining,
          reset: limit.reset,
        },
        { status: 429 }
      );
    }
    // 3. 이메일 중복 체크 (trustedEmail과 email 모두 검사)
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ trustedEmail: email }, { email }],
      },
    });
    if (existing) {
      // ✅ 이미 가입된 계정인데 인증이 안 된 경우 → 로그인 유도
      if (!existing.emailVerified || existing.status === UserStatus.PENDING) {
        return NextResponse.json(
          {
            error: "EMAIL_IN_USE",
            reason: "need_verify",
            message: "이미 가입된 이메일입니다. 로그인 후 인증을 완료해주세요.",
            redirect: "/auth/signin",
            email,
          },
          { status: 400 }
        );
      }
      // ✅ 이미 인증까지 완료된 계정
      return NextResponse.json(
        {
          error: "EMAIL_IN_USE",
          reason: "duplicate",
          message: "이미 가입된 이메일입니다.",
          redirect: "/auth/signin",
        },
        { status: 400 }
      );
    }
    // 4. 비밀번호 해시
    const hashedPassword = await hash(password, 10);
    // 5. 사용자 생성: trustedEmail은 null, 상태는 PENDING
    const newUser = await prisma.user.create({
      data: {
        email,
        trustedEmail: null,
        emailVerified: null,
        password: hashedPassword,
        name,
        status: UserStatus.PENDING, // 인증 전 상태
        role: "USER",
      },
    });
    // 6. 인증 메일 발송
    try {
      await createAndEmailVerificationToken(newUser, email, { ip, ua });
      logger.info("회원가입 인증 메일 발송 성공", { email, ip });
    } catch (mailError: any) {
      logger.error("회원가입 인증 메일 발송 실패", {
        email,
        error: mailError?.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: "MAIL_SEND_FAILED",
          message:
            "가입은 완료되었지만 인증 메일 발송에 실패했습니다. 관리자에게 문의하세요.",
          userId: newUser.id,
          email,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      message: "가입 완료. 이메일 인증을 진행해주세요.",
      userId: newUser.id,
      email, // ✅ 클라이언트에서 verify 페이지로 안내할 때 사용
    });
  } catch (error: any) {
    logger.error("회원가입 처리 중 오류", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        reason: "server_error",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
