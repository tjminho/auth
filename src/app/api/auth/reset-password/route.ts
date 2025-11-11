import { NextResponse } from "next/server";
import { verifyPasswordResetToken } from "@/lib/verification";
import { logger } from "@/lib/logger";

/**
 * ✅ 비밀번호 초기화 토큰 검증 API
 * - 사용자가 이메일로 받은 reset 링크 클릭 시 호출
 * - 토큰 유효성 검증 후 결과 반환
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { code: "TOKEN_REQUIRED", message: "토큰이 필요합니다." },
        { status: 400 }
      );
    }

    const result = await verifyPasswordResetToken(token);

    switch (result.code) {
      case "VERIFIED":
        logger.info("비밀번호 초기화 토큰 검증 성공", {
          userId: result.userId,
          email: result.email,
          vid: result.vid,
        });
        return NextResponse.json(
          {
            code: "VERIFIED",
            email: result.email,
            userId: result.userId,
            vid: result.vid,
          },
          { status: 200 }
        );

      case "RESET_TOKEN_EXPIRED":
        return NextResponse.json(
          { code: "RESET_TOKEN_EXPIRED", message: "토큰이 만료되었습니다." },
          { status: 400 }
        );

      case "RESET_TOKEN_NOT_FOUND":
        return NextResponse.json(
          {
            code: "RESET_TOKEN_NOT_FOUND",
            message: "토큰을 찾을 수 없습니다.",
          },
          { status: 404 }
        );

      case "USER_NOT_FOUND":
        return NextResponse.json(
          { code: "USER_NOT_FOUND", message: "사용자를 찾을 수 없습니다." },
          { status: 404 }
        );

      case "INVALID_SIGNATURE":
        return NextResponse.json(
          { code: "INVALID_SIGNATURE", message: "잘못된 토큰입니다." },
          { status: 400 }
        );

      case "EXPIRED":
        return NextResponse.json(
          { code: "RESET_TOKEN_EXPIRED", message: "토큰이 만료되었습니다." },
          { status: 400 }
        );

      default:
        return NextResponse.json(
          { code: result.code ?? "SERVER_ERROR", message: "검증 실패" },
          { status: 500 }
        );
    }
  } catch (err: any) {
    logger.error("비밀번호 초기화 토큰 검증 중 서버 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", message: err?.message || "서버 오류" },
      { status: 500 }
    );
  }
}
