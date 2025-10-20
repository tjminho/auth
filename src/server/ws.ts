import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { prisma } from "@/lib/prisma"; // DB 검증용
import dayjs from "dayjs";
type Conn = { ws: WebSocket; createdAt: number };
const clients = new Map<string, Set<Conn>>();
let wss: WebSocketServer | null = null;
// ✅ vid 생성 + DB 저장
export async function createVerificationId(userId: string) {
  const vid = crypto.randomBytes(16).toString("hex");
  await prisma.verificationSession.create({
    data: {
      vid,
      userId,
      expiresAt: dayjs().add(10, "minute").toDate(), // 10분 유효
    },
  });
  return vid;
}
export function initWebSocketServer() {
  if (wss) return wss;
  const port = process.env.WS_PORT || 3007;
  wss = new WebSocketServer({ port: Number(port) });
  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url!, "http://localhost");
      const vid = url.searchParams.get("vid");
      if (!vid) {
        ws.close();
        return;
      }
      // ✅ DB에서 vid 검증
      const record = await prisma.verificationSession.findUnique({
        where: { vid },
      });
      if (!record || record.expiresAt < new Date()) {
        ws.send(
          JSON.stringify({ type: "error", message: "invalid_or_expired_vid" })
        );
        ws.close();
        return;
      }
      const conn: Conn = { ws, createdAt: Date.now() };
      const set = clients.get(vid) || new Set<Conn>();
      set.add(conn);
      clients.set(vid, set);
      ws.on("close", () => {
        set.delete(conn);
        if (set.size === 0) clients.delete(vid);
      });
      ws.send(JSON.stringify({ type: "connected" }));
    } catch (err: any) {
      console.error("WS connection error:", err);
      ws.close();
    }
  });
  console.log(`🚀 WS 서버 실행: ws://localhost:${port}`);
  return wss;
}
// ✅ 인증 완료 시 호출
export async function notifyVerified(vid: string, email: string) {
  const set = clients.get(vid);
  if (!set) return;
  for (const c of set) {
    try {
      c.ws.send(JSON.stringify({ code: "VERIFIED", email })); // ✅ code로 표준화
      c.ws.close();
    } catch (err) {
      console.error("WS send error:", err);
    }
  }
  clients.delete(vid);
  await prisma.verificationSession.deleteMany({ where: { vid } });
}
