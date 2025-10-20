import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth"; // Auth.js v5
export async function POST(req: Request) {
  try {
    const session = await auth();
    // ✅ 관리자 권한 체크
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json(
        { error: "userId가 필요합니다." },
        { status: 400 }
      );
    }
    // ✅ 사용자 차단 처리
    await prisma.user.update({
      where: { id: userId },
      data: { status: "BLOCKED" },
    });
    // ✅ 해당 사용자의 세션 모두 삭제 (즉시 로그아웃)
    await prisma.session.deleteMany({
      where: { userId },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("사용자 차단 실패:", err);
    return NextResponse.json(
      { error: "사용자 차단 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
