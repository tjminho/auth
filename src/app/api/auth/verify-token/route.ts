import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/verification";
import { auth } from "@/auth"; // 선택적 세션
import { logger } from "@/lib/logger";
import { issueSession, SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // 세션은 선택적 (로그인 전에도 이메일 인증 가능)
    const session = await auth().catch(() => null);

    const body = await req.json().catch(() => ({}));
    const token = (body?.token || "").trim();
    const email = (body?.email || "").trim().toLowerCase();
    const vid = (body?.vid || "").trim();
    logger.debug("verify-token input", { token, email, vid });

    if (!token || !email) {
      logger.warn("잘못된 인증 요청", { token, email, vid });
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          message: "유효하지 않은 인증 요청입니다.",
        },
        { status: 400 }
      );
    }

    const result = await verifyEmailToken(token);

    switch (result.code) {
      case "VERIFIED": {
        logger.info("이메일 인증 성공", {
          email: result.email,
          userId: result.userId,
          vid: result.vid,
        });

        // DB 업데이트
        const user = await prisma.user.update({
          where: { id: result.userId },
          data: { emailVerified: new Date(), status: "ACTIVE" },
        });

        // 세션 갱신
        const sessionPayload: SessionPayload = {
          id: user.id,
          email: user.email!,
          role: user.role,
          status: user.status,
          emailVerified: true,
          provider: user.provider ?? "credentials",
        };

        return await issueSession(sessionPayload);
      }

      case "ALREADY_VERIFIED": {
        logger.info("이미 인증된 계정", {
          email: result.email,
          userId: result.userId,
          vid: result.vid,
        });

        // 최신 세션 보장
        const user = await prisma.user.findUnique({
          where: { id: result.userId },
        });
        if (user) {
          const sessionPayload: SessionPayload = {
            id: user.id,
            email: user.email!,
            role: user.role,
            status: user.status,
            emailVerified: !!user.emailVerified,
            provider: user.provider ?? "credentials",
          };
          return await issueSession(sessionPayload);
        }

        return NextResponse.json(
          {
            success: true,
            code: "ALREADY_VERIFIED",
            message: "이미 인증된 계정입니다.",
            email: result.email,
            userId: result.userId,
            vid: result.vid,
          },
          { status: 200 }
        );
      }

      case "EXPIRED":
        logger.warn("인증 링크 만료", { email, vid });
        return NextResponse.json(
          {
            success: false,
            code: "EXPIRED",
            message: "인증 링크가 만료되었습니다. 다시 요청해주세요.",
          },
          { status: 410 }
        );

      case "INVALID_SIGNATURE":
        logger.error("잘못된 서명", { email, vid });
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_SIGNATURE",
            message: "잘못된 인증 요청입니다.",
          },
          { status: 400 }
        );

      case "NOT_FOUND":
        logger.error("인증 정보 없음", { email, vid });
        return NextResponse.json(
          {
            success: false,
            code: "NOT_FOUND",
            message: "인증 정보를 찾을 수 없습니다.",
          },
          { status: 404 }
        );

      case "USER_NOT_FOUND":
        logger.error("사용자 없음", { email, vid });
        return NextResponse.json(
          {
            success: false,
            code: "USER_NOT_FOUND",
            message: "사용자를 찾을 수 없습니다.",
          },
          { status: 404 }
        );

      case "RATE_LIMITED":
        return NextResponse.json(
          {
            success: false,
            code: "RATE_LIMITED",
            message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          },
          { status: 429 }
        );

      case "DAILY_LIMIT_EXCEEDED":
        return NextResponse.json(
          {
            success: false,
            code: "DAILY_LIMIT_EXCEEDED",
            message: "하루 인증 요청 횟수를 초과했습니다.",
          },
          { status: 429 }
        );

      default:
        logger.error("알 수 없는 결과 코드", { code: result.code, email, vid });
        return NextResponse.json(
          {
            success: false,
            code: result.code,
            message: "인증 처리에 실패했습니다.",
          },
          { status: 500 }
        );
    }
  } catch (err: any) {
    logger.error("서버 오류", { error: err?.message, stack: err?.stack });
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
