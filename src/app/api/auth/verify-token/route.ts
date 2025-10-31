import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { logger } from "@/lib/logger";
import { sendFCM } from "@/lib/fcm";

// ✅ 이메일 마스킹 유틸
function maskEmail(email: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 3) + "***@" + domain;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const vidFromBody = typeof body.vid === "string" ? body.vid.trim() : null;
    const emailParam =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!token) {
      logger.warn("이메일 인증 실패: 토큰 누락", {
        ip: req.headers.get("x-forwarded-for"),
      });
      return NextResponse.json(
        {
          success: false,
          code: "TOKEN_MISSING",
          message: "토큰이 누락되었습니다.",
        },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;

    // ✅ 토큰 검증
    const result = await verifyEmailByValueToken(token, { ip, ua });
    if (!result) {
      logger.warn("이메일 인증 실패: 토큰 검증 실패", {
        token: token.slice(0, 6) + "...",
        ip,
        ua,
      });
      return NextResponse.json(
        {
          success: false,
          code: "TOKEN_INVALID",
          message: "토큰 검증에 실패했습니다.",
        },
        { status: 400 }
      );
    }

    const { email, code, vs, userId } = result;

    if (code !== "VERIFIED") {
      logger.warn("이메일 인증 실패", {
        code,
        email: maskEmail(email ?? ""),
        ip,
        ua,
      });
      return NextResponse.json(
        { success: false, code, message: "인증 처리에 실패했습니다.", email },
        { status: 400 }
      );
    }

    // ✅ 이메일 매칭 추가 검증
    if (emailParam && emailParam !== (email ?? "").toLowerCase()) {
      logger.warn("이메일 불일치", {
        expected: emailParam,
        actual: maskEmail(email ?? ""),
        ip,
      });
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_MISMATCH",
          message: "토큰과 이메일이 일치하지 않습니다.",
        },
        { status: 400 }
      );
    }

    // ✅ 인증 성공 로그
    logger.info("이메일 인증 성공", {
      userId,
      email: maskEmail(email ?? ""),
      ip,
      ua,
      vid: vidFromBody ?? vs ?? null,
    });

    // 관리자 FCM 알림
    try {
      await sendFCM({
        title: "이메일 인증 완료",
        body: `사용자 ${maskEmail(email ?? "")}가 인증을 완료했습니다.`,
        topic: "admin-alerts",
      });
    } catch (err: any) {
      logger.warn("FCM 알림 실패", {
        email: maskEmail(email ?? ""),
        error: err?.message,
      });
    }

    // ✅ 여기서는 notifyVerified 호출하지 않음
    return NextResponse.json(
      {
        success: true,
        code: "VERIFIED",
        message: "이메일 인증이 완료되었습니다.",
        email,
        vid: vidFromBody ?? vs ?? null, // 프론트에서 사용
      },
      { status: 200 }
    );
  } catch (e: any) {
    logger.error("이메일 인증 처리 중 서버 오류", {
      message: e?.message,
      stack: e?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
