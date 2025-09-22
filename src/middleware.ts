import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  // 로그인 상태에서 로그인/회원가입 페이지 접근 차단
  if (
    (pathname.startsWith("/auth/signin") ||
      pathname.startsWith("/auth/signup")) &&
    token
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 인증 페이지 자체는 보호 로직에서 제외
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // 보호 라우트: 로그인 안 된 경우
  if (!token) {
    const url = new URL("/auth/signin", nextUrl.origin);
    if (!pathname.startsWith("/dashboard")) {
      url.searchParams.set("callbackUrl", pathname + nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  // 이메일 미인증 → verify 페이지로
  if ((token as any).unverified) {
    const url = new URL("/auth/verify", nextUrl.origin);
    url.searchParams.set("email", (token as any).email || "");
    return NextResponse.redirect(url);
  }

  // 구독자 전용 페이지 보호
  if (pathname.startsWith("/premium")) {
    if (token.role !== "SUBSCRIBER") {
      return NextResponse.redirect(new URL("/subscribe", req.url));
    }
  }

  // 모더레이터 전용 페이지 보호
  if (pathname.startsWith("/moderation")) {
    if (!["MODERATOR", "ADMIN"].includes(token.role as string)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // 관리자 전용 페이지 보호
  if (pathname.startsWith("/admin")) {
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/settings",
    "/settings/:path*",
    "/billing",
    "/billing/:path*",
    "/premium",
    "/moderation",
    "/admin",
    "/admin/:path*",
  ],
};
