import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { signIn } from "@/auth"; // Auth.js v5 export (서버에서 호출 가능)

export async function POST(req: Request) {
  try {
    const { token, userAgent } = await req.json();

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "missing_token" },
        { status: 400 }
      );
    }

    const email = await verifyEmailByValueToken(token, {
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      ua: userAgent ?? req.headers.get("user-agent") ?? undefined,
    });

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "invalid_or_expired" },
        { status: 400 }
      );
    }

    // 세션 자동 생성 시도
    // 주의: Credentials authorize에 "토큰 기반 로그인" 경로가 필요합니다.
    // 없으면 이 호출은 실패할 수 있으며, 그 경우 프론트에서 세션 갱신(또는 재로그인)으로 처리해야 합니다.
    try {
      const res = await signIn("credentials", {
        email,
        // 아래 필드는 authorize에서 분기용으로 참조하도록 구현 필요
        tokenLogin: "1",
        redirect: false,
      });

      // signIn이 리다이렉트/응답 객체를 반환할 수 있으므로, 실패 추정 시 처리
      if ((res as any)?.error) {
        return NextResponse.json(
          { ok: true, email, session: "pending" },
          { status: 200 }
        );
      }
    } catch {
      // 세션 생성 실패 → 이메일 인증은 성공이므로 200 반환, 클라이언트에서 세션 재요청
      return NextResponse.json(
        { ok: true, email, session: "pending" },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, email, session: "created" });
  } catch (err) {
    console.error("[verify-token] error:", err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
