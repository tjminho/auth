import { initWebSocketServer } from "@/server/ws"; // ✅ 정확한 파일 경로 지정

const wss = initWebSocketServer();

process.on("SIGINT", () => {
  console.log("🛑 서버 종료 중...");
  wss.close(() => {
    console.log("✅ WebSocket 서버 정상 종료");
    process.exit(0);
  });
});
