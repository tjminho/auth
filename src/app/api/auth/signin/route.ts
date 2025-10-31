import { NextResponse } from "next/server";
import { signIn } from "@/auth"; // ✅ auth()는 여기서 즉시 확인하지 않음
import { z } from "zod";
import { hitLogin } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const SignInSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SignInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    // ✅ 로그인 시도 제한
    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipHeader.split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") ?? undefined;
    const limit = await hitLogin(ip, email);
    if (limit.limited) {
      logger.warn("로그인 시도 제한 초과", { email, ip, ua });
      return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429 });
    }

    // ✅ NextAuth Credentials Provider 호출
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    // ✅ NextAuth v5에서는 res.ok가 false여도 error가 없으면 성공일 수 있음
    if (res?.error) {
      logger.error("NextAuth signIn 실패", { email, error: res.error });
      return NextResponse.json(
        {
          error: res.error || "SIGNIN_FAILED",
          message: "로그인에 실패했습니다.",
        },
        { status: 401 }
      );
    }

    // ✅ 여기서는 세션을 즉시 확인하지 않고, 클라이언트에서 useSession()으로 확인
    logger.info("로그인 성공", { email, ip });
    return NextResponse.json({ success: true, url: res?.url || "/" });
  } catch (err: any) {
    logger.error("signin route error", {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        reason: "server_error",
        message: "서버 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
