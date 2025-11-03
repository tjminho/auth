import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { signupSchema } from "@/lib/validation";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { UserStatus } from "@prisma/client";
import { hit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto"; // ✅ SSE용 vid 생성

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // 1. 입력값 검증
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const firstError =
        parsed.error.flatten().formErrors[0] ??
        Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ??
        "잘못된 입력값입니다.";

      return NextResponse.json(
        {
          success: false,
          error: "INVALID_INPUT",
          reason: "invalid",
          message: firstError,
        },
        { status: 400 }
      );
    }

    // ✅ 이메일 전처리
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const name = parsed.data.name?.trim();

    // 2. 요청 제한
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") ?? undefined;

    const limit = await hit(ip, email);
    if (limit.limited) {
      logger.warn("회원가입 요청 제한 초과", {
        email: maskEmail(email),
        ip,
        ua,
      });
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMITED",
          reason: "rate_limited",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          remaining: limit.remaining,
          reset: limit.reset,
        },
        { status: 429 }
      );
    }

    // 3. 이메일 중복 체크
    const existing = await prisma.user.findFirst({
      where: { OR: [{ trustedEmail: email }, { email }] },
    });

    if (existing) {
      if (!existing.emailVerified || existing.status === UserStatus.PENDING) {
        return NextResponse.json(
          {
            success: false,
            error: "EMAIL_IN_USE",
            reason: "need_verify",
            message: "이미 가입된 이메일입니다. 로그인 후 인증을 완료해주세요.",
            redirect: "/auth/signin",
            email,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "EMAIL_IN_USE",
          reason: "duplicate",
          message: "이미 가입된 이메일입니다.",
          redirect: "/auth/signin",
        },
        { status: 400 }
      );
    }

    // 4. 비밀번호 해시
    const hashedPassword = await hash(password, 12);

    // 5. 사용자 생성
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          email,
          trustedEmail: null,
          emailVerified: null,
          password: hashedPassword,
          name,
          status: UserStatus.PENDING,
          role: "USER",
        },
      });
    } catch (dbError: any) {
      if (dbError.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            error: "EMAIL_IN_USE",
            reason: "duplicate",
            message: "이미 가입된 이메일입니다.",
            redirect: "/auth/signin",
          },
          { status: 400 }
        );
      }
      logger.error("회원가입 DB 오류", { error: dbError?.message });
      throw dbError;
    }

    // 6. VerificationSession 생성 + 인증 메일 발송
    let vid: string | null = null;
    try {
      // ✅ SSE용 vid 생성 (UUID)
      vid = randomUUID();

      await prisma.verificationSession.create({
        data: {
          userId: newUser.id,
          vid,
          createdAt: new Date(),
        },
      });

      // ✅ vid를 메일 발송 함수에 전달
      await createAndEmailVerificationToken(newUser, email, { ip, ua, vid });

      logger.info("회원가입 인증 메일 발송 성공", {
        email: maskEmail(email),
        ip,
        vid,
      });
    } catch (mailError: any) {
      logger.error("회원가입 인증 메일 발송 실패", {
        email: maskEmail(email),
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
      email,
      vid, // ✅ 프론트에서 verify 페이지 이동 시 사용
    });
  } catch (error: any) {
    logger.error("회원가입 처리 중 오류", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        error: "SERVER_ERROR",
        reason: "server_error",
        message: "서버 오류가 발생했습니다.",
      },
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
