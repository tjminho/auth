import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { emailSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    // 1. 세션 확인
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("다른 이메일 설정 실패: 인증되지 않은 요청");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2. 요청 바디 파싱 및 이메일 형식 검증
    const { email } = await req.json();
    if (!emailSchema.safeParse(email).success) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    // 3. 현재 유저 조회
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      logger.warn("다른 이메일 설정 실패: 유저 없음", {
        userId: session.user.id,
      });
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // 4. trustedEmail 업데이트 (중복 처리)
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { trustedEmail: email },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        logger.warn("다른 이메일 설정 실패: 이미 사용 중인 이메일", { email });
        return NextResponse.json(
          { error: "이미 사용 중인 이메일입니다." },
          { status: 400 }
        );
      }
      throw err;
    }

    // 5. 인증 메일 발송
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    await createAndEmailVerificationToken(email, { ip });

    logger.info("다른 이메일 인증 메일 발송 완료", {
      userId: user.id,
      email,
      ip,
    });
    return NextResponse.json({ ok: true, session: "updated" });
  } catch (err: any) {
    const msg =
      typeof err?.message === "string" ? err.message : "failed_to_send";
    const status = msg.includes("잠시 후") ? 429 : 500;

    logger.error("다른 이메일 설정 처리 중 오류", {
      error: msg,
      stack: err?.stack,
    });
    return NextResponse.json({ error: msg }, { status });
  }
}
