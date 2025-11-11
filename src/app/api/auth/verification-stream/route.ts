import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ✅ SSE 스트림 라우트
 * - 클라이언트가 vid를 포함해 연결하면
 * - 서버는 인증 상태를 주기적으로 확인해 이벤트 전송
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vid = searchParams.get("vid");

  if (!vid) {
    return new Response("Missing vid", { status: 400 });
  }

  // ✅ SSE 헤더 설정
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // 연결 성공 이벤트
      send("connected", { vid });
      logger.info("SSE 연결 시작", { vid });

      const interval = setInterval(async () => {
        try {
          const session = await prisma.verificationSession.findUnique({
            where: { vid },
          });

          if (!session) {
            send("error", { code: "NOT_FOUND" });
            clearInterval(interval);
            controller.close();
            return;
          }

          if (session.verifiedAt) {
            send("verified", {
              vid,
              userId: session.userId,
              email: session.email,
            });
            clearInterval(interval);
            controller.close();
            return;
          }

          if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
            send("expired", { vid });
            clearInterval(interval);
            controller.close();
            return;
          }

          // 아직 인증 안 됨 → keep-alive
          send("waiting", { vid });
          // ping 이벤트로 연결 유지
          send("ping", { ts: Date.now() });
        } catch (err: any) {
          logger.error("SSE 인증 상태 확인 실패", { vid, error: String(err) });
          send("error", { code: "SERVER_ERROR" });
          clearInterval(interval);
          controller.close();
        }
      }, 5000); // 5초마다 확인

      // ✅ 타임아웃 처리 (60초 후 자동 종료)
      const timeout = setTimeout(() => {
        send("timeout", { vid });
        clearInterval(interval);
        controller.close();
        logger.info("SSE 연결 타임아웃 종료", { vid });
      }, 60_000);

      // ✅ 연결 종료 처리
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearTimeout(timeout);
        controller.close();
        logger.info("SSE 연결 종료", { vid });
      });
    },
  });

  return new Response(stream, { headers });
}
