// test-ws.js
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3007");

ws.on("open", () => {
  console.log("✅ 연결 성공");
  ws.send("Hello Server!");
});

ws.on("message", (msg) => {
  console.log("📩 수신:", msg.toString());
});

ws.on("close", () => console.log("🔌 연결 종료"));
ws.on("error", (err) => console.error("❌ 에러:", err));