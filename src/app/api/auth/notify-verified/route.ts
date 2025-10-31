import { NextResponse } from "next/server";
import { notifyVerified } from "@/server/ws";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma"; // 세션 삭제 지연용

// ✅ 이메일 마스킹 유틸
function maskEmail(email: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 3) + "***@" + domain;
}

// ✅ 이메일 유효성 검사
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ vid 형식 검증 (UUID or 32자리 hex)
function isValidVid(str: string) {
  const uuidRegex = /^[0-9a-fA-F-]{36}$/;
  const hex32Regex = /^[0-9a-fA-F]{32}$/;
  return uuidRegex.test(str) || hex32Regex.test(str);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const vid = typeof body.vid === "string" ? body.vid.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    // ✅ 파라미터 검증
    if (!vid || !email) {
      logger.warn("notify-verified 실패: vid 또는 email 누락", { vid, email });
      return NextResponse.json(
        {
          success: false,
          code: "MISSING_PARAMS",
          message: "vid와 email이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (!isValidVid(vid)) {
      logger.warn("notify-verified 실패: 잘못된 vid 형식", { vid });
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_VID",
          message: "유효하지 않은 vid 형식입니다.",
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      logger.warn("notify-verified 실패: 잘못된 이메일 형식", { vid, email });
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_EMAIL",
          message: "유효하지 않은 이메일 형식입니다.",
        },
        { status: 400 }
      );
    }

    // ✅ notifyVerified 호출 (재시도 포함)
    let delivered = false;
    try {
      delivered = await notifyVerified(vid, email, {
        retries: 5, // 최대 5회 재시도
        delayMs: 2000, // 2초 간격
      });
    } catch (err: any) {
      logger.error("notify-verified 내부 오류", {
        vid,
        email: maskEmail(email),
        message: err?.message,
      });
      return NextResponse.json(
        {
          success: false,
          code: "NOTIFY_ERROR",
          message: "알림 전송 중 오류가 발생했습니다.",
        },
        { status: 500 }
      );
    }

    // ✅ 실패 처리 (grace period 후 세션 삭제)
    if (!delivered) {
      logger.warn("notify-verified 최종 실패: 연결 없음", {
        vid,
        email: maskEmail(email),
      });

      setTimeout(async () => {
        try {
          await prisma.verificationSession.deleteMany({ where: { vid } });
          logger.info("만료된 VerificationSession 정리 완료", { vid });
        } catch (err: any) {
          logger.error("VerificationSession 정리 실패", {
            vid,
            message: err?.message,
          });
        }
      }, 30_000);

      return NextResponse.json(
        {
          success: false,
          code: "NO_CONNECTION",
          message: "해당 vid로 연결된 클라이언트가 없습니다.",
        },
        { status: 404 }
      );
    }

    // ✅ 성공 처리
    logger.info("notify-verified 성공", {
      vid,
      email: maskEmail(email),
    });

    return NextResponse.json({
      success: true,
      code: "NOTIFIED",
      message: "알림 전송 성공",
    });
  } catch (e: any) {
    logger.error("notify-verified API 서버 오류", {
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
