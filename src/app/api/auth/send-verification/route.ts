import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { hit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { auth } from "@/auth";
import { User } from "@prisma/client";
import { createVerificationId } from "@/server/ws";

function isRealEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

export async function POST(req: Request) {
  try {
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;
    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").trim().toLowerCase();

    // ✅ 이메일 필수
    if (!email) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          session: "unchanged",
          code: "EMAIL_REQUIRED",
          message: "이메일이 필요합니다.",
        },
        { status: 400 }
      );
    }

    // ✅ 이메일 형식 검증
    if (!isRealEmail(email) || email.endsWith("@placeholder.local")) {
      logger.warn("잘못된 이메일 형식", { email, ip, ua });
      return NextResponse.json(
        {
          success: false,
          sent: false,
          session: "unchanged",
          code: "INVALID_EMAIL",
          message: "올바른 이메일 주소를 입력하세요.",
        },
        { status: 400 }
      );
    }

    // ✅ 요청 제한
    const limit = await hit(ip, email).catch((err) => {
      logger.error("Rate-limit 체크 실패", { error: err?.message, ip, email });
      return { limited: false };
    });
    if (limit.limited) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          session: "unchanged",
          code: "RATE_LIMITED",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        },
        { status: 429 }
      );
    }

    // ✅ 로그인 유저 확인
    const session = await auth().catch(() => null);
    const sessionUserId = session?.user?.id;
    if (!sessionUserId) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          session: "unchanged",
          code: "UNAUTHORIZED",
          message: "로그인이 필요합니다.",
        },
        { status: 401 }
      );
    }

    // ✅ 다른 계정에서 이미 사용 중인지 검사
    const duplicate = await prisma.user.findFirst({
      where: {
        OR: [{ trustedEmail: email }, { email }],
        NOT: { id: sessionUserId },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          session: "unchanged",
          code: "EMAIL_IN_USE",
          message: "이미 다른 계정에서 사용 중인 이메일입니다.",
        },
        { status: 400 }
      );
    }

    // ✅ 현재 로그인된 유저 가져오기
    let user: User | null = await prisma.user.findUnique({
      where: { id: sessionUserId },
    });
    let targetEmail = email;

    // placeholder.local → 새 이메일로 교체
    if (user && user.email?.endsWith("@placeholder.local")) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: targetEmail,
          emailVerified: null,
          trustedEmail: targetEmail,
        },
      });
    } else if (!user) {
      user = await prisma.user.findFirst({
        where: { OR: [{ trustedEmail: email }, { email }] },
      });
    }

    // ✅ 유저 없음 → 존재 노출 방지
    if (!user) {
      return NextResponse.json(
        {
          success: true,
          sent: false,
          session: "unchanged",
          code: "USER_NOT_FOUND",
        },
        { status: 200 }
      );
    }

    // ✅ 이미 인증된 경우 → 존재 노출 방지
    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: true,
          sent: false,
          session: "unchanged",
          code: "ALREADY_VERIFIED",
        },
        { status: 200 }
      );
    }

    // ✅ 인증 메일 발송
    try {
      const vid = await createVerificationId(user.id);
      await createAndEmailVerificationToken(user, targetEmail, { ip, ua, vid });

      logger.info("인증 메일 발송 성공", {
        userId: user.id,
        targetEmail,
        ip,
        ua,
        vid,
      });

      return NextResponse.json(
        {
          success: true,
          sent: true,
          session: "updated",
          code: "MAIL_SENT",
          vid,
        },
        { status: 200 }
      );
    } catch (err: any) {
      const msg = err?.message || "";
      logger.error("인증 메일 발송 실패", {
        userId: user?.id,
        email: targetEmail,
        ip,
        ua,
        error: msg,
      });

      switch (msg) {
        case "RATE_LIMITED":
          return NextResponse.json(
            {
              success: false,
              sent: false,
              session: "unchanged",
              code: "RATE_LIMITED",
              message: "잠시 후 다시 시도해주세요.",
            },
            { status: 429 }
          );
        case "DAILY_LIMIT_EXCEEDED":
          return NextResponse.json(
            {
              success: false,
              sent: false,
              session: "unchanged",
              code: "DAILY_LIMIT_EXCEEDED",
              message: "오늘은 더 이상 인증 메일을 보낼 수 없습니다.",
            },
            { status: 429 }
          );
        case "RESEND_FAILED":
          return NextResponse.json(
            {
              success: false,
              sent: false,
              session: "unchanged",
              code: "RESEND_FAILED",
              message: "메일 발송에 실패했습니다.",
            },
            { status: 500 }
          );
        default:
          return NextResponse.json(
            {
              success: false,
              sent: false,
              session: "unchanged",
              code: "SERVER_ERROR",
              message: msg || "서버 오류",
            },
            { status: 500 }
          );
      }
    }
  } catch (e: any) {
    logger.error("인증 메일 발송 처리 중 서버 오류", {
      message: e?.message,
      stack: e?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        sent: false,
        session: "unchanged",
        code: "SERVER_ERROR",
        message: e?.message ?? "서버 오류",
      },
      { status: 500 }
    );
  }
}
