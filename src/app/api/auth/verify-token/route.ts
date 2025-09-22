import { NextResponse } from "next/server";
import { verifyEmailByValueToken } from "@/lib/verification";
import { auth } from "@/auth";
export async function POST(req: Request) {
  try {
    const { token, userAgent } = await req.json();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "missing_token", reason: "토큰이 없습니다." },
        { status: 400 }
      );
    }
    const email = await verifyEmailByValueToken(token, {
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      ua: userAgent ?? req.headers.get("user-agent") ?? undefined,
    });
    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_or_expired",
          reason: "토큰이 유효하지 않습니다.",
        },
        { status: 400 }
      );
    }
    const session = await auth();
    if (session?.user?.id) {
      return NextResponse.json({ ok: true, email, session: "updated" });
    }
    return NextResponse.json({ ok: true, email, session: "pending" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "server_error", reason: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
