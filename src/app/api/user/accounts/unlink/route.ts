import { NextResponse } from "next/server";
import { auth } from "@/auth"; // v5에서 auth() 사용
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { provider } = await req.json();

    if (!provider) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "provider 값이 필요합니다." },
        { status: 400 }
      );
    }

    // ✅ 계정 해제 (해당 provider 계정 삭제)
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("unlink API error:", e);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}
