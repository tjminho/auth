import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { email } = await req.json();
    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    // 사용자의 trustedEmail을 갱신
    await prisma.user.update({
      where: { id: session.user.id },
      data: { trustedEmail: email },
    });

    // 인증 메일 발송 (쿨다운 및 토큰 로직 포함)
    await createAndEmailVerificationToken(email);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // createAndEmailVerificationToken에서 던진 메시지 전달
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
