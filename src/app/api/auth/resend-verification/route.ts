import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { hitEmail } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { createVerificationId } from "@/server/ws";

function clearAuthCookies(response: NextResponse) {
  response.cookies.set("next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  response.cookies.set("__Secure-next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  return response;
}

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

    if (!email || typeof email !== "string") {
      logger.warn("재발송 요청 실패: 이메일 누락", { ip, ua });
      return NextResponse.json(
        {
          success: false,
          sent: false,
          code: "EMAIL_REQUIRED",
          message: "이메일이 필요합니다.",
        },
        { status: 400 }
      );
    }
    const normalizedEmail = email.trim().toLowerCase();

    // ✅ Rate Limit 체크
    const limit = await hitEmail(ip, normalizedEmail);
    if (limit.limited) {
      logger.warn("재발송 요청 Rate Limit 초과", {
        email: maskEmail(normalizedEmail),
        ip,
        ua,
        retryAfter: limit.retryAfter,
      });
      return NextResponse.json(
        {
          success: false,
          sent: false,
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

    logger.info("유저 조회 결과", {
      userId: user?.id,
      email: maskEmail(normalizedEmail),
      emailVerified: user?.emailVerified,
    });

    if (!user) {
      logger.warn("재발송 실패: 유저 없음", {
        email: maskEmail(normalizedEmail),
        ip,
      });
      const response = NextResponse.json(
        {
          success: false,
          sent: false,
          code: "USER_NOT_FOUND",
          message: "해당 유저를 찾을 수 없습니다.",
        },
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
        {
          success: true,
          code: "ALREADY_VERIFIED",
          message: "이미 인증된 계정입니다.",
        },
        { status: 200 }
      );
    }

    const targetEmail = user.trustedEmail ?? user.email;
    if (!targetEmail) {
      logger.error("재발송 실패: 발송 대상 이메일 없음", { userId: user.id });
      return NextResponse.json(
        {
          success: false,
          sent: false,
          code: "NO_TARGET_EMAIL",
          message: "발송 대상 이메일을 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    try {
      // ✅ 1) WebSocket 세션 식별자 생성
      const vid = await createVerificationId(user.id);

      // ✅ 2) 메타에 vid 포함하여 토큰 생성 및 메일 발송
      await createAndEmailVerificationToken(user, targetEmail, { ip, ua, vid });

      // ✅ 3) 프론트로 vid 반환 → verify 페이지가 즉시 WS 연결
      return NextResponse.json(
        { success: true, sent: true, code: "MAIL_SENT", vid },
        { status: 200 }
      );
    } catch (err: any) {
      logger.error("재발송 실패", {
        userId: user.id,
        email: maskEmail(targetEmail),
        ip,
        ua,
        code: err?.code,
        message: err?.message,
      });
      const status = err?.code === "RATE_LIMITED" ? 429 : 500;
      return NextResponse.json(
        {
          success: false,
          sent: false,
          code: err?.code || "SERVER_ERROR",
          message: err?.message || "재발송 실패",
          retryAfter: err?.retryAfter,
        },
        { status }
      );
    }
  } catch (err: any) {
    logger.error("재발송 처리 중 서버 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        sent: false,
        code: "SERVER_ERROR",
        message: err?.message || "재발송 실패",
      },
      { status: 500 }
    );
  }
}
