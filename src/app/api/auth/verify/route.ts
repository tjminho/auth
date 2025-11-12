import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/verification";
import { VerifyResult } from "@/lib/verification-types";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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
        { code: "INVALID_REQUEST", message: "유효하지 않은 인증 요청입니다." },
        { status: 400 }
      );
    }

    const result: VerifyResult = await verifyEmailToken(token, vid, req);

    // ✅ 세션과 userId 교차 검증
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
          code: "FORBIDDEN",
          message: "세션 사용자와 토큰 대상이 일치하지 않습니다.",
        },
        { status: 403 }
      );
    }

    switch (result.code) {
      case "VERIFIED": {
        const { code, ...rest } = result;

        // ✅ 검증 성공 시 DB 업데이트: email과 trustedEmail 동일하게
        if (result.userId && result.email) {
          try {
            await prisma.user.update({
              where: { id: result.userId },
              data: {
                email: result.email,
                trustedEmail: result.email,
                emailVerified: new Date(),
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
          { code: "EXPIRED", message: "인증 링크가 만료되었습니다.", ...rest },
          { status: 410 }
        );
      }

      case "INVALID_SIGNATURE": {
        const { code, ...rest } = result;
        logger.error("잘못된 서명", { vid });
        return NextResponse.json(
          { code: "INVALID_SIGNATURE", message: "잘못된 서명입니다.", ...rest },
          { status: 400 }
        );
      }

      case "NOT_FOUND":
      case "USER_NOT_FOUND": {
        const { code, ...rest } = result;
        logger.error("인증 정보 없음", { vid, email: emailInput });
        return NextResponse.json(
          { code, message: "인증 정보를 찾을 수 없습니다.", ...rest },
          { status: 404 }
        );
      }

      case "RATE_LIMITED":
      case "DAILY_LIMIT_EXCEEDED": {
        const { code, ...rest } = result;
        logger.warn("요청 제한", { vid, email: emailInput });
        return NextResponse.json(
          { code, message: "요청 제한에 걸렸습니다.", ...rest },
          { status: 429 }
        );
      }

      case "INVALID_EMAIL": {
        const { code, ...rest } = result;
        logger.warn("잘못된 이메일", { email: emailInput });
        return NextResponse.json(
          {
            code: "INVALID_EMAIL",
            message: "잘못된 이메일 주소입니다.",
            ...rest,
          },
          { status: 400 }
        );
      }

      case "RESEND_FAILED": {
        const { code, ...rest } = result;
        logger.error("재전송 실패", { vid, email: emailInput });
        return NextResponse.json(
          {
            code: "RESEND_FAILED",
            message: "인증 메일 재전송에 실패했습니다.",
            ...rest,
          },
          { status: 500 }
        );
      }

      case "USER_ID_REQUIRED": {
        const { code, ...rest } = result;
        logger.error("사용자 ID 누락", { vid });
        return NextResponse.json(
          {
            code: "USER_ID_REQUIRED",
            message: "사용자 ID가 필요합니다.",
            ...rest,
          },
          { status: 400 }
        );
      }

      case "EMAIL_SENT": {
        const { code, ...rest } = result;
        logger.info("인증 메일 발송 완료", { vid, email: result.email });
        return NextResponse.json(
          { code: "EMAIL_SENT", message: "인증 메일을 발송했습니다.", ...rest },
          { status: 200 }
        );
      }

      default: {
        const { code, ...rest } = result;
        logger.error("알 수 없는 오류", { vid, email: emailInput });
        return NextResponse.json(
          { code, message: "인증 처리에 실패했습니다.", ...rest },
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
      { code: "SERVER_ERROR", message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
