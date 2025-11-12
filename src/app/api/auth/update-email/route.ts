import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await auth().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").trim().toLowerCase();

    // ✅ 로그인 확인
    if (!session?.user?.id) {
      logger.warn("이메일 업데이트 실패: 로그인 필요");
      return NextResponse.json(
        { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    // ✅ 이메일 형식 검증
    const isValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !email.endsWith("@placeholder.local");

    if (!isValid) {
      logger.warn("잘못된 이메일 형식", { email });
      return NextResponse.json(
        { code: "INVALID_EMAIL", message: "올바른 이메일 주소를 입력하세요." },
        { status: 400 }
      );
    }

    // ✅ 다른 계정에서 이미 사용 중인지 검사
    const duplicate = await prisma.user.findFirst({
      where: {
        OR: [{ trustedEmail: email }, { email }],
        NOT: { id: session.user.id },
        deletedAt: null,
      },
    });
    if (duplicate) {
      logger.warn("이메일 업데이트 실패: 다른 계정에서 사용 중", { email });
      return NextResponse.json(
        {
          code: "EMAIL_IN_USE",
          message: "이미 다른 계정에서 사용 중인 이메일입니다.",
        },
        { status: 409 }
      );
    }

    // ✅ 현재 유저 업데이트
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        email,
        trustedEmail: email,
        emailVerified: null, // 새 이메일은 다시 인증 필요
      },
    });

    logger.info("이메일 업데이트 성공", {
      userId: updated.id,
      email: updated.email,
    });

    return NextResponse.json(
      {
        code: "EMAIL_UPDATED",
        message: "이메일이 성공적으로 업데이트되었습니다.",
        email: updated.email,
        userId: updated.id,
      },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error("이메일 업데이트 처리 중 서버 오류", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { code: "SERVER_ERROR", message: err?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}
