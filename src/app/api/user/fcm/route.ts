import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth"; // v5에서 auth() 사용

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "유효한 FCM 토큰이 필요합니다." },
        { status: 400 }
      );
    }

    // ✅ FcmToken 테이블에 upsert
    await prisma.fcmToken.upsert({
      where: { token }, // token은 unique
      update: { userId: session.user.id },
      create: { token, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("FCM token 저장 실패:", e);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}
