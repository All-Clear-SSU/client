// src/lib/socket.ts
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let client: Client | null = null;

export function getStompClient() {
  if (client) return client;

  // ✅ HTTPS/HTTP 자동 대응 (Netlify는 HTTPS 환경)
  // Netlify.toml에 /ws 프록시가 설정되어 있으므로 절대 URL 필요 없음
  // 로컬에서는 환경 변수의 WebSocket URL 사용

  // 🔥 기존 코드 (주석처리)
  // const isLocal = window?.location?.hostname === "localhost";
  // const sockUrl = isLocal ? "http://16.184.55.244:8080/ws" : "/ws";

  // ✅ 수정된 코드: 환경 변수로 WebSocket URL 관리
  const isLocal = window?.location?.hostname === "localhost";
  const sockUrl = isLocal
    ? (import.meta.env.VITE_WS_URL || "http://localhost:8080/ws")
    : "/ws";

  client = new Client({
    webSocketFactory: () => new SockJS(sockUrl),
    reconnectDelay: 5000, // 자동 재연결
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: (msg) => console.log("[STOMP]", msg),
  });

  return client;
}