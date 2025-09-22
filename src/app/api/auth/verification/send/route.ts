import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { emailSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { email, userId: bodyUserId } = await req.json();

    // 세션의 user.id 또는 body의 userId 중 하나 사용
    const userId = session?.user?.id || bodyUserId;
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 이메일 형식 검증
    if (!emailSchema.safeParse(email).success) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    // 사용자 존재 여부 확인
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // trustedEmail 갱신
    await prisma.user.update({
      where: { id: userId },
      data: { trustedEmail: email },
    });

    // 인증 메일 발송 (쿨다운 및 토큰 로직 포함)
    await createAndEmailVerificationToken(email);

    // 세션 갱신 신호 포함
    return NextResponse.json({ ok: true, session: "updated" });
  } catch (err: any) {
    const msg =
      typeof err?.message === "string" ? err.message : "failed_to_send";
    const status = msg.includes("잠시 후")
      ? 429
      : msg.includes("사용자가 없습니다")
        ? 404
        : 500;

    return NextResponse.json({ error: msg }, { status });
  }
}
