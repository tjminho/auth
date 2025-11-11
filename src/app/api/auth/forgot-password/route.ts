import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { sendPasswordResetEmail } from "@/lib/mail"; // ✅ 이메일 발송 유틸
import { generateToken } from "@/lib/token"; // ✅ 랜덤 토큰 생성 유틸

const ForgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();

    // ✅ 유저 존재 여부 확인
    const user = await prisma.user.findFirst({ where: { email } });

    // ✅ 보안상 존재하지 않는 이메일도 동일 응답
    if (!user) {
      logger.warn("비밀번호 재설정 요청: 이메일 없음", { email });
      return NextResponse.json({ success: true });
    }

    // ✅ 기존 토큰 무효화
    await prisma.passwordResetToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // ✅ 새 토큰 생성
    const token = generateToken(); // 예: uuid or nanoid
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30분 유효

    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    // ✅ 이메일 발송
    await sendPasswordResetEmail(email, token);

    logger.info("비밀번호 재설정 메일 발송", { email });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error("forgot-password route error", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
