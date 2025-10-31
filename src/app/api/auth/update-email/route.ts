import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return local.slice(0, 3) + "***@" + domain;
}

export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();
    if (!userId || !email) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_INPUT",
          message: "userId와 email이 필요합니다.",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ✅ 유저 조회
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          code: "USER_NOT_FOUND",
          message: "해당 유저를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    // ✅ trustedEmail 업데이트 + 필요 시 emailVerified 리셋
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        trustedEmail: normalizedEmail,
        emailVerified: null,
        updatedAt: new Date(),
      },
    });

    logger.info("trustedEmail 업데이트 성공", {
      userId: updated.id,
      email: maskEmail(normalizedEmail),
    });

    return NextResponse.json({
      success: true,
      code: "EMAIL_UPDATED",
      message: "이메일이 업데이트되었습니다.",
      userId: updated.id,
      trustedEmail: updated.trustedEmail,
    });
  } catch (err: any) {
    logger.error("trustedEmail 업데이트 실패", { message: err?.message });
    return NextResponse.json(
      { success: false, code: "SERVER_ERROR", message: "이메일 업데이트 실패" },
      { status: 500 }
    );
  }
}
