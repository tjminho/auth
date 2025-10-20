import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { logger } from "@/lib/logger";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // ✅ 토큰 누락 처리
  if (!token) {
    logger.warn("이메일 인증 실패: 토큰 누락");
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_token", baseUrl)
    );
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = req.headers.get("user-agent") ?? undefined;
  try {
    // ✅ 토큰 검증 및 trustedEmail 업데이트
    const result = await verifyEmailByValueToken(token, { ip, ua });
    if (!result) {
      logger.warn("이메일 인증 실패: 토큰 무효 또는 처리 오류", {
        token,
        ip,
        ua,
      });
      return NextResponse.redirect(
        new URL("/auth/error?reason=invalid_or_expired", baseUrl)
      );
    }
    const { email, code } = result;
    switch (code) {
      case "VERIFIED":
        logger.info("이메일 인증 성공", { email, ip, ua });
        return NextResponse.redirect(
          new URL(
            `/auth/token-bridge?session=updated&email=${encodeURIComponent(
              email
            )}`,
            baseUrl
          )
        );
      case "EXPIRED":
        logger.warn("이메일 인증 실패: 토큰 만료", { email, ip, ua });
        return NextResponse.redirect(
          new URL("/auth/error?reason=timeout", baseUrl)
        );
      case "ALREADY_USED":
        logger.warn("이메일 인증 실패: 이미 사용된 토큰", { email, ip, ua });
        return NextResponse.redirect(
          new URL("/auth/error?reason=used", baseUrl)
        );
      case "EMAIL_MISMATCH":
        logger.warn("이메일 인증 실패: 이메일 불일치", { email, ip, ua });
        return NextResponse.redirect(
          new URL("/auth/error?reason=mismatch", baseUrl)
        );
      case "USER_NOT_FOUND":
        logger.warn("이메일 인증 실패: 사용자 없음", { email, ip, ua });
        return NextResponse.redirect(
          new URL("/auth/error?reason=user", baseUrl)
        );
      case "INVALID_SIGNATURE":
        logger.warn("이메일 인증 실패: 잘못된 서명", { email, ip, ua });
        return NextResponse.redirect(
          new URL("/auth/error?reason=invalid", baseUrl)
        );
      default:
        logger.warn("이메일 인증 실패: 알 수 없는 코드", {
          email,
          code,
          ip,
          ua,
        });
        return NextResponse.redirect(
          new URL("/auth/error?reason=invalid_or_expired", baseUrl)
        );
    }
  } catch (err: any) {
    logger.error("이메일 인증 처리 중 서버 오류", {
      message: err?.message,
      stack: err?.stack,
      ip,
      ua,
    });
    return NextResponse.redirect(
      new URL("/auth/error?reason=server_error", baseUrl)
    );
  }
}
