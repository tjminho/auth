import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { logger } from "@/lib/logger";
import { sendFCM } from "@/lib/fcm";
import { signJwt } from "@/lib/jwt";

function maskEmail(email: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
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
      return NextResponse.json(
        { success: false, code: "TOKEN_MISSING", vid: vidFromBody },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;

    const result = await verifyEmailByValueToken(token, { ip, ua });
    if (!result || result.code !== "VERIFIED") {
      return NextResponse.json(
        { success: false, code: "TOKEN_INVALID", vid: vidFromBody },
        { status: 400 }
      );
    }

    const { email, userId } = result;

    if (emailParam && emailParam !== (email ?? "").toLowerCase()) {
      return NextResponse.json(
        { success: false, code: "EMAIL_MISMATCH", vid: vidFromBody },
        { status: 400 }
      );
    }

    logger.info("이메일 인증 성공", {
      userId,
      email: maskEmail(email ?? ""),
      ip,
      ua,
      vid: vidFromBody,
    });

    try {
      await sendFCM({
        title: "이메일 인증 완료",
        body: `사용자 ${maskEmail(email ?? "")}가 인증을 완료했습니다.`,
        topic: "admin-alerts",
      });
    } catch (err: any) {
      logger.warn("FCM 알림 실패", { error: err?.message });
    }

    // ✅ JWT 재발급 + 쿠키 세팅
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          code: "USER_ID_MISSING",
          message: "유저 ID가 없습니다.",
        },
        { status: 400 }
      );
    }

    const newToken = await signJwt({
      uid: userId,
      email,
      emailVerified: new Date().toISOString(),
    });

    const res = NextResponse.json(
      {
        success: true,
        code: "VERIFIED",
        message: "이메일 인증이 완료되었습니다.",
        email,
        vid: vidFromBody,
      },
      { status: 200 }
    );

    res.cookies.set("next-auth.session-token", newToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30, // 30분
    });

    return res;
  } catch (e: any) {
    logger.error("이메일 인증 처리 중 서버 오류", { message: e?.message });
    return NextResponse.json(
      { success: false, code: "SERVER_ERROR", message: "서버 오류" },
      { status: 500 }
    );
  }
}
