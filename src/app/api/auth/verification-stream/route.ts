import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vid = searchParams.get("vid");

  if (!vid) {
    return new Response("Missing vid", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let interval: NodeJS.Timeout | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      const safeClose = () => {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      };

      const cleanup = () => {
        if (interval) clearInterval(interval);
        if (timeoutId) clearTimeout(timeoutId);
        safeClose();
      };

      // 초기 연결 이벤트
      controller.enqueue(encoder.encode(`event: connected\ndata: ok\n\n`));

      // 주기적으로 DB 확인
      interval = setInterval(async () => {
        try {
          const session = await prisma.verificationSession.findUnique({
            where: { vid },
          });

          if (session?.verifiedAt) {
            controller.enqueue(
              encoder.encode(`event: verified\ndata: true\n\n`)
            );
            cleanup();
          }
        } catch (err: any) {
          logger.error("verification-stream DB 에러", {
            vid,
            message: err?.message,
            stack: err?.stack,
          });
          controller.enqueue(encoder.encode(`event: error\ndata: db\n\n`));
          cleanup();
        }
      }, 2000);

      // 안전장치: 최대 5분 후 자동 종료
      timeoutId = setTimeout(
        () => {
          controller.enqueue(encoder.encode(`event: timeout\ndata: true\n\n`));
          cleanup();
        },
        5 * 60 * 1000
      );

      // 연결 종료 시 정리
      (req.signal as AbortSignal).addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
