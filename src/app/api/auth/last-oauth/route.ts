import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    // JWT 토큰 확인
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    const userId = token?.sub; // NextAuth JWT 기본 userId는 sub에 들어있음

    if (!userId) {
      // 로그인 안 된 경우에도 200 반환 → 클라이언트에서 에러 핸들링 불필요
      return NextResponse.json({
        provider: null,
        date: null,
        ip: null,
        location: null,
        userAgent: null,
      });
    }

    // 최근 OAuth 로그인 기록 조회 (credentials 제외)
    const history = await prisma.loginHistory.findFirst({
      where: {
        userId,
        NOT: { provider: "credentials" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!history) {
      return NextResponse.json({
        provider: null,
        date: null,
        ip: null,
        location: null,
        userAgent: null,
      });
    }

    return NextResponse.json({
      provider: history.provider,
      date: history.createdAt.toISOString(), // ISO 문자열로 변환
      ip: history.ip ?? null,
      location: history.location ?? null,
      userAgent: history.userAgent ?? null,
    });
  } catch (e) {
    console.error("last-oauth API error:", e);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}
