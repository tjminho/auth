import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndEmailVerificationToken } from "@/lib/verification";
import { hit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
function clearAuthCookies(response: NextResponse) {
  response.cookies.set("next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  response.cookies.set("__Secure-next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  return response;
}
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_REQUIRED",
          message: "이메일이 필요합니다.",
        },
        { status: 400 }
      );
    }
    // ✅ 요청 제한 (IP + 이메일 기준)
    const limit = await hit(ip, email);
    if (limit.limited) {
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        },
        { status: 429 }
      );
    }
    // ✅ 유저 조회 (trustedEmail 우선)
    const user = await prisma.user.findFirst({
      where: { OR: [{ trustedEmail: email }, { email }] },
    });
    // ✅ 유저 없음 또는 이미 인증됨 → 존재 노출 방지 + 세션 쿠키 삭제
    if (!user || user.emailVerified) {
      const response = NextResponse.json(
        { success: true, sent: false },
        { status: 200 }
      );
      return clearAuthCookies(response);
    }
    // ✅ 발송 대상 이메일 결정
    const targetEmail = user.trustedEmail ?? user.email;
    if (!targetEmail) {
      return NextResponse.json(
        {
          success: false,
          code: "NO_TARGET_EMAIL",
          message: "발송 대상 이메일을 찾을 수 없습니다.",
        },
        { status: 400 }
      );
    }
    // ✅ 인증 메일 재발송
    await createAndEmailVerificationToken(user, targetEmail, { ip, ua });
    logger.info("인증 메일 재발송", {
      userId: user.id,
      email: targetEmail,
      ip,
      ua,
    });
    return NextResponse.json({ success: true, sent: true }, { status: 200 });
  } catch (err: any) {
    logger.error("재발송 실패", { message: err?.message, stack: err?.stack });
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message: err?.message || "재발송 실패",
      },
      { status: 500 }
    );
  }
}
