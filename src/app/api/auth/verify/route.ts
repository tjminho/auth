import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/verification";
import { VerifyResult } from "@/lib/verification-types";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const body = await req.json().catch(() => ({}));

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const vid = typeof body?.vid === "string" ? body.vid.trim() : "";
    const emailInput =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    // ✅ 입력 검증
    if (!token || !vid || token.length < 10 || vid.length < 5) {
      logger.warn("잘못된 인증 요청", { token, vid, email: emailInput });
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          message: "유효하지 않은 인증 요청입니다.",
        },
        { status: 400 }
      );
    }

    const result: VerifyResult = await verifyEmailToken(token, vid, req);

    // ✅ 세션과 userId 교차 검증 (세션이 있을 때만 체크)
    if (
      "userId" in result &&
      result.userId &&
      session?.user?.id &&
      session.user.id !== result.userId
    ) {
      logger.warn("세션 사용자 불일치", {
        sessionUserId: session.user.id,
        tokenUserId: result.userId,
      });
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          message: "세션 사용자와 토큰 대상이 일치하지 않습니다.",
        },
        { status: 403 }
      );
    }

    switch (result.code) {
      case "VERIFIED": {
        const { code, ...rest } = result;

        if (result.userId && result.email) {
          try {
            await prisma.user.update({
              where: { id: result.userId },
              data: {
                email: result.email,
                trustedEmail: result.email,
                emailVerified: new Date(),
                status: UserStatus.ACTIVE, // ✅ 인증 완료 후 상태 변경
              },
            });
          } catch (dbErr: any) {
            logger.error("DB 업데이트 실패", {
              userId: result.userId,
              email: result.email,
              error: dbErr?.message,
            });
            return NextResponse.json(
              {
                success: false,
                code: "SERVER_ERROR",
                message: "DB 업데이트 중 오류가 발생했습니다.",
              },
              { status: 500 }
            );
          }
        }

        logger.info("이메일 인증 성공", {
          userId: result.userId,
          vid: result.vid,
        });
        return NextResponse.json(
          {
            success: true,
            code: "VERIFIED",
            message: "이메일 인증이 완료되었습니다.",
            ...rest,
          },
          { status: 200 }
        );
      }

      case "ALREADY_VERIFIED": {
        const { code, ...rest } = result;
        logger.info("이미 인증된 계정", { userId: result.userId });
        return NextResponse.json(
          {
            success: true,
            code: "ALREADY_VERIFIED",
            message: "이미 인증된 계정입니다.",
            ...rest,
          },
          { status: 200 }
        );
      }

      case "EXPIRED": {
        const { code, ...rest } = result;
        logger.warn("인증 링크 만료", { vid });
        return NextResponse.json(
          {
            success: false,
            code,
            message: "인증 링크가 만료되었습니다.",
            ...rest,
          },
          { status: 410 }
        );
      }

      // ... 나머지 케이스 동일, success 필드만 추가

      default: {
        const { code, ...rest } = result;
        logger.error("알 수 없는 오류", { vid, email: emailInput });
        return NextResponse.json(
          {
            success: false,
            code,
            message: "인증 처리에 실패했습니다.",
            ...rest,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    logger.error("verify/route.ts 처리 중 예외 발생", {
      message: err?.message,
      stack: err?.stack,
    });
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
