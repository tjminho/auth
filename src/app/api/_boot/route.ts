import { NextResponse } from "next/server";
import { initWebSocketServer } from "@/server/ws";
// 서버 시작 시 WebSocket 서버도 같이 실행
initWebSocketServer();
export async function GET() {
  return NextResponse.json({ ok: true });
}
