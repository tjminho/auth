import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import dayjs from "dayjs";
import { logger } from "@/lib/logger";

type Conn = { ws: WebSocket; createdAt: number };
const clients = new Map<string, Set<Conn>>();

function maskEmail(email: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 3) + "***@" + domain;
}

export async function createVerificationId(userId: string) {
  const vid = crypto.randomBytes(16).toString("hex");
  await prisma.verificationSession.create({
    data: { vid, userId, expiresAt: dayjs().add(10, "minute").toDate() },
  });
  return vid;
}

export function initWebSocketServer() {
  const port = Number(process.env.WS_PORT || 3007);
  const host = process.env.WS_HOST || "0.0.0.0";

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/notify-verified") {
      try {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        await new Promise<void>((resolve) => req.on("end", () => resolve()));
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const vid = typeof body.vid === "string" ? body.vid.trim() : "";
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

        const set = clients.get(vid);
        if (!set || set.size === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              code: "NO_CONNECTION",
              message: "해당 vid로 연결된 클라이언트가 없습니다.",
            })
          );
        }

        let deliveredCount = 0;
        for (const c of set) {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(
              JSON.stringify({
                code: "VERIFIED",
                email,
                message: "email_verified",
              })
            );
            deliveredCount++;
          }
        }

        logger.info("[WS] notifyVerified 전송", {
          vid,
          email: maskEmail(email),
          targets: set.size,
          deliveredCount,
        });

        clients.delete(vid);
        await prisma.verificationSession.deleteMany({ where: { vid } });

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            code: "NOTIFIED",
            message: "알림 전송 성공",
            deliveredCount,
          })
        );
      } catch (err: any) {
        logger.error("[WS] notify-verified endpoint 오류", {
          message: err?.message,
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: false,
            code: "SERVER_ERROR",
            message: "서버 오류가 발생했습니다.",
          })
        );
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, code: "NOT_FOUND" }));
  });

  const wss = new WebSocketServer({ server, host });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const vid = url.searchParams.get("vid");

      if (!vid) {
        ws.send(JSON.stringify({ code: "ERROR", message: "missing_vid" }));
        ws.close();
        return;
      }

      const record = await prisma.verificationSession.findUnique({
        where: { vid },
      });
      if (!record) {
        ws.send(
          JSON.stringify({ code: "ERROR", message: "invalid_or_expired_vid" })
        );
        ws.close();
        return;
      }

      if (record.expiresAt < new Date()) {
        await prisma.verificationSession.deleteMany({ where: { vid } });
        ws.send(JSON.stringify({ code: "ERROR", message: "expired_vid" }));
        ws.close();
        return;
      }

      const conn: Conn = { ws, createdAt: Date.now() };
      const set = clients.get(vid) || new Set<Conn>();
      set.add(conn);
      clients.set(vid, set);

      logger.info("[WS] 연결 성공", {
        vid,
        userId: record.userId,
        totalClients: set.size,
      });

      ws.on("close", async () => {
        set.delete(conn);
        if (set.size === 0) {
          clients.delete(vid);
          setTimeout(async () => {
            try {
              await prisma.verificationSession.deleteMany({ where: { vid } });
              logger.info("[WS] 세션 정리 완료", { vid });
            } catch (err: any) {
              logger.error("[WS] 세션 정리 실패", { vid, error: err?.message });
            }
          }, 30_000);
        }
        logger.info("[WS] 연결 해제", { vid, remaining: set.size });
      });

      ws.on("error", (err) => {
        logger.error("[WS] 소켓 에러", { vid, error: err?.message });
      });

      ws.send(
        JSON.stringify({ code: "CONNECTED", message: "WebSocket connected" })
      );

      const timeoutMs = Number(process.env.WS_TIMEOUT_MS || 15 * 60 * 1000);
      const timeout = setTimeout(async () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ code: "TIMEOUT", message: "connection_timeout" })
          );
          ws.close();
        }
        await prisma.verificationSession.deleteMany({ where: { vid } });
      }, timeoutMs);

      ws.on("close", () => clearTimeout(timeout));
    } catch (err: any) {
      logger.error("[WS] connection error", {
        message: err?.message,
        stack: err?.stack,
      });
      ws.close();
    }
  });

  server.listen(port, host, () => {
    logger.info(`🚀 WS 서버 실행: ws://${host}:${port}`);
    logger.info(`🔧 관리 엔드포인트: http://${host}:${port}/notify-verified`);
  });

  return { wss, server };
}
