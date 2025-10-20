// src/app/api/auth/verify-token/route.ts
import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { logger } from "@/lib/logger";
import { notifyVerified } from "@/server/ws";
import { sendFCM } from "@/lib/fcm";

export async function POST(req: Request) {
  try {
    const {
      token,
      vid,
      email: emailParam,
    } = await req.json().catch(() => ({}));

    // ✅ 토큰 유효성 검사
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        {
          success: false,
          code: "TOKEN_MISSING",
          message: "토큰 누락",
          session: "unchanged",
        },
        { status: 400 }
      );
    }

    // ✅ 클라이언트 정보 (로그용)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? undefined;

    // ✅ 토큰 검증 (DB 조회 + 만료 확인)
    const result = await verifyEmailByValueToken(token, { ip, ua });
    if (!result) {
      logger.warn("이메일 인증 실패: 내부 오류", {
        token: token.slice(0, 6) + "...",
        ip,
        ua,
        providedEmail: emailParam,
      });
      return NextResponse.json(
        {
          success: false,
          code: "TOKEN_INVALID",
          message: "토큰 검증 실패",
          session: "unchanged",
        },
        { status: 400 }
      );
    }

    const { email, code } = result;

    // ✅ 실패 코드 처리
    if (code !== "VERIFIED") {
      logger.warn("이메일 인증 실패", {
        code,
        email,
        ip,
        ua,
        providedEmail: emailParam,
      });

      let message = "인증 처리에 실패했습니다.";
      if (code === "EXPIRED") message = "만료된 인증 링크입니다.";
      else if (code === "ALREADY_USED")
        message = "이미 사용된 인증 링크입니다.";
      else if (code === "EMAIL_MISMATCH")
        message = "토큰과 이메일이 일치하지 않습니다.";
      else if (code === "USER_NOT_FOUND")
        message = "해당 유저를 찾을 수 없습니다.";
      else if (code === "INVALID_SIGNATURE") message = "잘못된 토큰입니다.";

      return NextResponse.json(
        { success: false, code, message, email, session: "unchanged" },
        { status: 400 }
      );
    }

    // ✅ 이메일 매칭 추가 검증
    if (emailParam && emailParam.toLowerCase() !== email.toLowerCase()) {
      logger.warn("이메일 불일치", { email, emailParam, ip });
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_MISMATCH",
          message: "토큰과 이메일이 일치하지 않습니다.",
          session: "unchanged",
        },
        { status: 400 }
      );
    }

    // ✅ 인증 성공 처리
    logger.info("이메일 인증 성공", { email, ip, ua, vid: vid ?? null });

    // 관리자 FCM 알림
    await sendFCM({
      title: "이메일 인증 완료",
      body: `사용자 ${email}가 인증을 완료했습니다.`,
      topic: "admin-alerts",
    });

    // WebSocket 알림 (브라우저 자동 반응)
    if (vid) {
      await notifyVerified(vid, email);
    }

    // ✅ 최종 응답
    return NextResponse.json(
      {
        success: true,
        code: "VERIFIED",
        message: "이메일 인증 완료",
        email,
        session: "updated", // 클라이언트에서 useSession().update() 호출 유도
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
        message: e?.message ?? "서버 오류",
        session: "unchanged",
      },
      { status: 500 }
    );
  }
}
