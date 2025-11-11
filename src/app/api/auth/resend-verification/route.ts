import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { hitEmail } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ✅ 인증 쿠키 제거 유틸
function clearAuthCookies(response: NextResponse) {
  response.cookies.set("next-auth.session-token", "", { path: "/", maxAge: 0 });
  response.cookies.set("__Secure-next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}

// ✅ 이메일 마스킹 유틸
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return local.slice(0, 3) + "***@" + domain;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;

    // ✅ 이메일 유효성 체크
    if (!email || typeof email !== "string") {
      logger.warn("재발송 요청 실패: 이메일 누락", { ip, ua });
      return NextResponse.json(
        { code: "EMAIL_REQUIRED", message: "이메일이 필요합니다." },
        { status: 400 }
      );
    }
    const normalizedEmail = email.trim().toLowerCase();

    // ✅ Rate Limit 체크
    const limit = await hitEmail(ip, normalizedEmail).catch((err) => {
      logger.error("Rate-limit 체크 실패", { error: err?.message, ip, email });
      return {
        limited: false,
        remaining: 1,
        reset: 60,
        count: 0,
        limit: 1,
        retryAfter: 0,
      }; // ✅ 항상 동일한 구조 반환
    });

    if (limit.limited) {
      logger.warn("재발송 요청 Rate Limit 초과", {
        email: maskEmail(normalizedEmail),
        ip,
        ua,
        retryAfter: limit.retryAfter,
      });
      return NextResponse.json(
        {
          code: "RATE_LIMITED",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
          retryAfter: limit.retryAfter,
        },
        { status: 429 }
      );
    }

    // ✅ 유저 조회
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ trustedEmail: normalizedEmail }, { email: normalizedEmail }],
      },
    });

    if (!user) {
      logger.warn("재발송 실패: 유저 없음", {
        email: maskEmail(normalizedEmail),
        ip,
      });
      const response = NextResponse.json(
        { code: "USER_NOT_FOUND", message: "해당 유저를 찾을 수 없습니다." },
        { status: 404 }
      );
      return clearAuthCookies(response);
    }

    if (user.emailVerified) {
      logger.info("재발송 불필요: 이미 인증됨", {
        userId: user.id,
        email: maskEmail(user.email ?? ""),
        ip,
      });
      return NextResponse.json(
        { code: "ALREADY_VERIFIED", message: "이미 인증된 계정입니다." },
        { status: 200 }
      );
    }

    const targetEmail = user.trustedEmail ?? user.email;
    if (!targetEmail) {
      logger.error("재발송 실패: 발송 대상 이메일 없음", { userId: user.id });
      return NextResponse.json(
        {
          code: "NO_TARGET_EMAIL",
          message: "발송 대상 이메일을 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    // ✅ VerificationSession 생성 + 메일 발송
    const { vid } = await createAndEmailVerificationToken(user, targetEmail);

    logger.info("재발송 성공", {
      userId: user.id,
      email: maskEmail(targetEmail),
      vid,
      ip,
      ua,
    });

    return NextResponse.json(
      { code: "MAIL_SENT", vid, email: targetEmail, userId: user.id },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error("재발송 처리 중 서버 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", message: err?.message || "재발송 실패" },
      { status: 500 }
    );
  }
}
