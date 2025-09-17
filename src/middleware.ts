import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt"; // Edge Runtime 지원

// 보호 경로
const PROTECTED = ["/dashboard", "/settings", "/billing"];

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // 보호 경로가 아니면 통과
  if (!PROTECTED.some((p) => nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Edge-safe: JWT 토큰에서 세션 정보 추출
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 로그인 안 된 경우 → 로그인 페이지로
  if (!token) {
    const url = new URL("/auth/signin", nextUrl.origin);
    url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 이메일 미인증 → verify 페이지로
  if ((token as any).user?.unverified) {
    const url = new URL("/auth/verify", nextUrl.origin);
    url.searchParams.set("email", (token as any).user?.email || "");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/billing/:path*"],
};
