import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/verification";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const session = await auth(); // 필요 시 세션 활용
    const body = await req.json().catch(() => ({}));

    const token = (body?.token || "").trim();
    const vid = (body?.vid || "").trim();
    const emailInput = (body?.email || "").trim().toLowerCase();

    if (!token || !vid) {
      logger.warn("잘못된 인증 요청", { token, vid, email: emailInput });
      return NextResponse.json(
        { code: "INVALID_REQUEST", message: "유효하지 않은 인증 요청입니다." },
        { status: 400 }
      );
    }

    const result = await verifyEmailToken(token, vid);

    switch (result.code) {
      case "VERIFIED":
        logger.info("이메일 인증 성공", {
          email: result.email,
          userId: result.userId,
          vid: result.vid,
        });
        return NextResponse.json(result, { status: 200 });

      case "ALREADY_VERIFIED":
        logger.info("이미 인증된 계정", {
          email: result.email,
          userId: result.userId,
          vid: result.vid,
        });
        return NextResponse.json(result, { status: 200 });

      case "EXPIRED":
        logger.warn("인증 링크 만료", { email: result.email, vid });
        return NextResponse.json(result, { status: 410 });

      case "INVALID_SIGNATURE":
        logger.error("잘못된 서명", { email: result.email, vid });
        return NextResponse.json(result, { status: 400 });

      case "NOT_FOUND":
      case "USER_NOT_FOUND":
        logger.error("인증 정보 없음", { email: result.email, vid });
        return NextResponse.json(result, { status: 404 });

      case "RATE_LIMITED":
      case "DAILY_LIMIT_EXCEEDED":
        return NextResponse.json(result, { status: 429 });

      default:
        logger.error("알 수 없는 오류", {
          code: result.code,
          email: result.email,
          vid,
        });
        return NextResponse.json(
          {
            code: result.code || "UNKNOWN",
            message: "인증 처리에 실패했습니다.",
          },
          { status: 500 }
        );
    }
  } catch (err: any) {
    logger.error("verify/route.ts 처리 중 예외 발생", {
      message: err?.message,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
