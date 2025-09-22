import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { logger } from "@/lib/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    logger.warn("이메일 인증 실패: 토큰 누락");
    return NextResponse.redirect(
      new URL("/auth/error?reason=missing_token", APP_URL)
    );
  }

  const headers = new Headers(req.headers);
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const ua = headers.get("user-agent") || undefined;

  try {
    const email = await verifyEmailByValueToken(token, { ip, ua });

    if (!email) {
      logger.warn("이메일 인증 실패: 토큰 무효/만료/불일치", { token, ip, ua });
      return NextResponse.redirect(
        new URL("/auth/error?reason=invalid_or_expired", APP_URL)
      );
    }

    logger.info("이메일 인증 성공", { email, ip, ua });

    // 인증 성공 시 홈으로 이동
    return NextResponse.redirect(new URL("/", APP_URL));
  } catch (err) {
    logger.error("이메일 인증 처리 중 서버 오류", { err, ip, ua });
    return NextResponse.redirect(
      new URL("/auth/error?reason=server_error", APP_URL)
    );
  }
}
