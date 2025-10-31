import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { hash } from "bcryptjs";

const ResetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const { token, password } = parsed.data;

    // ✅ 토큰 조회 및 검증
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      logger.warn("비밀번호 재설정 토큰 오류", { token });
      return NextResponse.json(
        {
          error: "INVALID_OR_EXPIRED_TOKEN",
          message: "토큰이 유효하지 않거나 만료되었습니다.",
        },
        { status: 400 }
      );
    }

    // ✅ 유저 조회
    const user = await prisma.user.findUnique({
      where: { email: resetToken.email },
    });

    if (!user) {
      logger.error("비밀번호 재설정 실패: 유저 없음", {
        email: resetToken.email,
      });
      return NextResponse.json(
        {
          error: "USER_NOT_FOUND",
          message: "해당 이메일의 유저를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    // ✅ 비밀번호 해시 후 저장
    const hashed = await hash(password, 10); // saltRounds = 10
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    // ✅ 토큰 사용 처리
    await prisma.passwordResetToken.update({
      where: { token },
      data: { used: true },
    });

    logger.info("비밀번호 재설정 성공", { email: user.email });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error("reset-password route error", {
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
