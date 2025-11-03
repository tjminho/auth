import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const vid = url.searchParams.get("vid");
  const email = url.searchParams.get("email");

  if (!vid || !email) {
    return NextResponse.redirect("/auth/error");
  }

  try {
    // ✅ 유저 인증 완료 처리
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    // ✅ VerificationSession 인증 완료 표시
    await prisma.verificationSession.update({
      where: { vid },
      data: { verifiedAt: new Date() },
    });

    // ✅ SSE 스트림이 verifiedAt 변화를 감지 → 클라이언트 자동 로그인
    return NextResponse.redirect("/");
  } catch (err) {
    return NextResponse.redirect("/auth/error");
  }
}
