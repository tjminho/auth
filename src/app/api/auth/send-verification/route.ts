"use server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { hit } from "@/lib/rate-limit";
export async function POST(req: Request) {
  try {
    const ip =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0] || "0.0.0.0";
    const { email } = await req.json();
    if (!email)
      return NextResponse.json(
        { error: "이메일이 필요합니다." },
        { status: 400 }
      );
    const limit = await hit(ip, email);
    if (limit.limited)
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
        { status: 429 }
      );
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: true }); // 존재노출 방지
    if (user.emailVerified) return NextResponse.json({ success: true });
    await createAndEmailVerificationToken(email);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
