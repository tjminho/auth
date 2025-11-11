import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type Role = "USER" | "SUBSCRIBER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
interface CustomToken {
  email?: string;
  role?: Role;
  unverified?: boolean; // 세션 콜백에서 trustedEmail/emailVerified를 기준으로 설정
}

// 애플리케이션 도메인만 허용 (callbackUrl 화이트리스트)
function normalizeSafeCallback(url: URL, pathnameWithSearch: string) {
  // 절대 URL로 넘어오는 경우를 방지: 항상 현재 origin 기준으로 재생성
  const safe = new URL(pathnameWithSearch, url.origin);
  // 추가로 외부 도메인 리다이렉트가 들어오지 않도록 강제
  if (safe.origin !== url.origin) {
    return new URL("/", url.origin);
  }
  return safe;
}

function hasRole(token: CustomToken | null, roles: Role[]) {
  return token != null && roles.includes(token.role ?? "USER");
}

export async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const token = (await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  })) as CustomToken | null;

  // 1) 로그인 상태에서 로그인/회원가입 페이지 접근 차단
  if (
    (pathname.startsWith("/auth/signin") ||
      pathname.startsWith("/auth/signup")) &&
    token
  ) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 2) 인증 경로는 보호 로직에서 제외 (무한 리다이렉트 방지)
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // 3) 보호 라우트 접근 시 미로그인 → 로그인 페이지로 이동
  if (!token) {
    const signinUrl = new URL("/auth/signin", url.origin);
    const callbackUrl = normalizeSafeCallback(url, pathname + url.search);
    signinUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    return NextResponse.redirect(signinUrl);
  }

  // 4) 이메일 미인증 → verify 페이지로 (민감 정보 쿼리 전달 금지)
  if (token.unverified) {
    return NextResponse.redirect(new URL("/auth/verify", url.origin));
  }

  // 5) 구독자 전용 보호: ADMIN도 허용
  if (
    pathname.startsWith("/premium") &&
    !hasRole(token, ["SUBSCRIBER", "ADMIN", "SUPER_ADMIN"])
  ) {
    return NextResponse.redirect(new URL("/subscribe", url.origin));
  }

  // 6) 모더레이터 전용 보호
  if (
    pathname.startsWith("/moderation") &&
    !hasRole(token, ["MODERATOR", "ADMIN", "SUPER_ADMIN"])
  ) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 7) 관리자 전용 보호
  if (
    pathname.startsWith("/admin") &&
    !hasRole(token, ["ADMIN", "SUPER_ADMIN"])
  ) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  // 8) 기본 처리
  return NextResponse.next();
}

// 미들웨어 적용 경로 (불필요한 /auth 전체 매칭 제거, 루프 최소화)
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/premium",
    "/moderation",
    "/admin/:path*",
  ],
};
