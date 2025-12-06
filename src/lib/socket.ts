// src/lib/socket.ts
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

let client: Client | null = null;

export function getStompClient() {
  if (client) return client;

  // ✅ HTTPS/HTTP 자동 대응 (Netlify는 HTTPS 환경)
  // Netlify.toml에 /ws 프록시가 설정되어 있으므로 절대 URL 필요 없음
  // 로컬에서는 http://16.184.55.244:8080/ws 로 자동 대체됨
  const isLocal = window?.location?.hostname === "localhost";
  const sockUrl = isLocal ? "http://16.184.55.244:8080/ws" : "/ws";

  client = new Client({
    webSocketFactory: () => new SockJS(sockUrl),
    reconnectDelay: 5000, // 자동 재연결
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: (msg) => console.log("[STOMP]", msg),
  });

  return client;
}