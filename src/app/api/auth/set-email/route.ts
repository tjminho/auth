import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";

export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: "필수 값이 누락되었습니다." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // trustedEmail 저장 및 인증 상태 초기화
    await prisma.user.update({
      where: { id: userId },
      data: { trustedEmail: email, emailVerified: null },
    });

    // 인증 메일 발송 (쿨다운 포함)
    await createAndEmailVerificationToken(email);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "이메일 설정 실패" },
      { status: 400 }
    );
  }
}
