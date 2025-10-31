import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  // 1️⃣ 로그인 상태에서 로그인/회원가입 페이지 접근 차단
  if (
    (pathname.startsWith("/auth/signin") ||
      pathname.startsWith("/auth/signup")) &&
    token
  ) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 2️⃣ 인증 관련 페이지 자체는 보호 로직에서 제외
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // 3️⃣ 보호 라우트: 로그인 안 된 경우 → 로그인 페이지로
  if (!token) {
    const signinUrl = new URL("/auth/signin", url.origin);
    // 로그인 후 원래 페이지로 돌아갈 수 있도록 callbackUrl 추가
    signinUrl.searchParams.set("callbackUrl", pathname + url.search);
    return NextResponse.redirect(signinUrl);
  }

  // 4️⃣ 이메일 미인증 → verify 페이지로
  if ((token as any).unverified) {
    const verifyUrl = new URL("/auth/verify", url.origin);
    verifyUrl.searchParams.set("email", (token as any).email || "");
    return NextResponse.redirect(verifyUrl);
  }

  // 5️⃣ 구독자 전용 페이지 보호
  if (pathname.startsWith("/premium") && token.role !== "SUBSCRIBER") {
    return NextResponse.redirect(new URL("/subscribe", url.origin));
  }

  // 6️⃣ 모더레이터 전용 페이지 보호
  if (
    pathname.startsWith("/moderation") &&
    !["MODERATOR", "ADMIN"].includes(token.role as string)
  ) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 7️⃣ 관리자 전용 페이지 보호
  if (pathname.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 8️⃣ 기본 처리
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
