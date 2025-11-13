import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { signupSchema } from "@/lib/validation";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { UserStatus } from "@prisma/client";
import { hit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { issueSession } from "@/lib/session";

// 이메일 로그 마스킹 유틸
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 2) + "***@" + domain;
}

export async function POST(req: Request) {
  try {
    // 1) 입력값 검증
    const body = await req.json().catch(() => ({}));
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const firstError =
        parsed.error.flatten().formErrors[0] ??
        Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ??
        "잘못된 입력값입니다.";
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_INPUT",
          reason: "invalid",
          message: firstError,
        },
        { status: 400 }
      );
    }

    // 2) 이메일/비밀번호/이름 전처리
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const name = parsed.data.name?.trim();

    // 3) 레이트 리밋
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") ?? undefined;

    const limit = await hit(ip, email);
    if (!limit.allowed) {
      logger.warn("회원가입 요청 제한 초과", {
        email: maskEmail(email),
        ip,
        ua,
        remaining: limit.remaining,
        reset: limit.reset,
      });
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          reason: "rate_limited",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          remaining: limit.remaining,
          reset: limit.reset,
        },
        { status: 429 }
      );
    }

    // 4) 기존 계정 조회
    const existing = await prisma.user.findFirst({
      where: { OR: [{ trustedEmail: email }, { email }] },
      select: {
        id: true,
        email: true,
        trustedEmail: true,
        password: true,
        emailVerified: true,
        status: true,
        provider: true,
      },
    });

    if (existing) {
      const isOAuthOnly =
        !existing.password &&
        !!existing.provider &&
        existing.provider !== "credentials";

      const needVerify =
        !existing.emailVerified || existing.status === UserStatus.PENDING;

      if (isOAuthOnly) {
        const redirect = `/auth/signin?email=${encodeURIComponent(
          email
        )}&reason=OAUTH_ACCOUNT_EXISTS`;
        return NextResponse.json(
          {
            success: false,
            code: "OAUTH_ACCOUNT_EXISTS",
            reason: "oauth_only",
            message:
              "이미 소셜 계정으로 가입되어 있습니다. 로그인 페이지에서 소셜 로그인을 진행해주세요.",
            email,
            redirect,
          },
          { status: 409 }
        );
      }

      if (needVerify) {
        const redirect = `/auth/signin?email=${encodeURIComponent(
          email
        )}&reason=EMAIL_NOT_VERIFIED`;
        return NextResponse.json(
          {
            success: false,
            code: "EMAIL_IN_USE",
            reason: "need_verify",
            message: "이미 가입된 이메일입니다. 로그인 후 인증을 완료해주세요.",
            email,
            redirect,
          },
          { status: 409 }
        );
      }

      const redirect = `/auth/signin?email=${encodeURIComponent(
        email
      )}&reason=EMAIL_IN_USE`;
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_IN_USE",
          reason: "duplicate",
          message: "이미 가입된 이메일입니다.",
          email,
          redirect,
        },
        { status: 409 }
      );
    }

    // 5) 비밀번호 해시
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    const hashedPassword = await hash(password, saltRounds);

    // 6) 신규 사용자 생성
    const newUser = await prisma.user.create({
      data: {
        email,
        trustedEmail: null,
        emailVerified: null,
        password: hashedPassword,
        name,
        status: UserStatus.PENDING,
        role: "USER",
        provider: "credentials",
      },
    });

    // 7) 제한 세션 발급 (emailVerified=false)
    const sessionResponse = await issueSession({
      id: newUser.id,
      email: newUser.email!,
      role: newUser.role,
      status: newUser.status,
      emailVerified: false,
      provider: "credentials",
    });

    // 8) 인증 토큰 발급 + 메일 발송
    const verifyResult = await createAndEmailVerificationToken(newUser, email);

    // 9) redirect 안전 처리 (가입 직후 자동 재발송 차단용 autoSent=true 포함)
    const redirect =
      verifyResult.code === "EMAIL_SENT" && verifyResult.vid
        ? `/auth/verify?email=${encodeURIComponent(
            email
          )}&vid=${encodeURIComponent(verifyResult.vid)}&autoSent=true`
        : `/auth/verify?email=${encodeURIComponent(email)}&autoSent=true`;

    logger.debug("회원가입 redirect 생성", { redirect }); // ✅ 추가

    // Common headers including Location
    const headers = {
      ...sessionResponse.headers,
      Location: redirect, // ✅ 힌트용
    };

    // 10) 응답 반환 (세션 쿠키 헤더 포함)
    if (verifyResult.code === "EMAIL_SENT") {
      logger.info("회원가입 성공 및 인증 메일 발송", {
        userId: newUser.id,
        email: maskEmail(email),
      });
      return NextResponse.json(
        {
          success: true,
          code: "SIGNUP_SUCCESS",
          reason: "signup_success",
          message: "회원가입이 완료되었습니다. 인증 메일을 확인해주세요.",
          userId: newUser.id,
          email,
          redirect,
        },
        { status: 201, headers }
      );
    } else {
      logger.warn("회원가입 인증 메일 발송 실패", {
        email: maskEmail(email),
        userId: newUser.id,
        code: verifyResult.code,
      });
      return NextResponse.json(
        {
          success: false, // ✅ 일관성
          code: verifyResult.code,
          reason: "mail_failed",
          message:
            "가입은 완료되었지만 인증 메일 발송에 실패했습니다. 잠시 후 다시 시도하거나 인증 메일 재발송을 진행해주세요.",
          userId: newUser.id,
          email,
          redirect,
        },
        { status: 202, headers }
      );
    }
  } catch (error: any) {
    logger.error("회원가입 처리 중 오류", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        reason: "server_error",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
