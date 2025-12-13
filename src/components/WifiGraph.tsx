// src/components/WifiGraph.tsx
// 🔥 기존 MQTT 방식 → WebSocket(STOMP) 방식으로 변경
// ✅ 기존 CSI 처리 로직 유지: 34개 부반송파를 각각 다른 색상으로 그래프 표시
import { useEffect, useRef, useState } from "react";
import { getStompClient } from "../lib/socket";
import type { IMessage, StompSubscription } from "@stomp/stompjs";

// CSI 세부 설정 (기존 WiFiGraph와 동일)
const WINDOW_SIZE = 150; // 최근 N 패킷만 표시

interface WifiGraphProps {
  sensorId?: string; // WiFi sensor ID
}

interface WifiSignalData {
  sensor_id: number;
  csi_amplitude_summary?: number[]; // 백엔드에서 계산된 진폭값 (각 부반송파)
  survivor_detected?: boolean;
  survivor_number?: string;
  confidence?: number;
}

export default function WifiGraph({ sensorId }: WifiGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [buffer, setBuffer] = useState<number[][]>([]); // 2D: [packet][subcarriers]

  /** WebSocket 구독 (MQTT 대신 사용) */
  useEffect(() => {
    if (!sensorId) return;

    const client = getStompClient();
    let subscription: StompSubscription | null = null;

    const subscribe = () => {
      if (!client.connected) return;

      const topic = `/topic/wifi-sensor/${sensorId}/signal`;

      subscription = client.subscribe(topic, (msg: IMessage) => {
        try {
          const data: WifiSignalData = JSON.parse(msg.body);

          // ✅ 백엔드에서 이미 진폭으로 변환된 CSI 데이터 사용
          const csiAmplitudes = data.csi_amplitude_summary;

          if (csiAmplitudes && csiAmplitudes.length > 0) {
            // 기존 로직: 슬라이딩 윈도우로 버퍼 관리
            setBuffer((prev) => {
              const next = [...prev, csiAmplitudes];
              if (next.length > WINDOW_SIZE) next.shift();
              return next;
            });
          }
        } catch (err) {
          console.error(`WiFi 신호 파싱 오류 (Sensor ${sensorId}):`, err);
        }
      });
    };

    // 연결 대기
    if (client.connected) {
      subscribe();
    } else {
      // 기존 onConnect 콜백을 보존하면서 새로운 콜백 추가
      const existingOnConnect = client.onConnect;
      client.onConnect = (frame) => {
        // 기존 콜백 실행 (App.tsx의 resubscribeAll 등)
        if (existingOnConnect) {
          existingOnConnect(frame);
        }
        // 구독 시작
        subscribe();
      };

      // 연결이 이미 되어있을 수도 있으므로 다시 확인
      if (client.connected) {
        subscribe();
      }
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [sensorId]);

  /** Canvas 렌더링 (기존 WiFiGraph와 동일) */
  useEffect(() => {
    if (!canvasRef.current || buffer.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;

    const subcarrierCount = buffer[0].length;

    ctx.clearRect(0, 0, width, height);

    // Normalize (기존 로직 그대로)
    const flat = buffer.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);

    const scaleY = (v: number) =>
      height - ((v - min) / (max - min)) * (height - 20);

    const stepX = width / WINDOW_SIZE;

    ctx.lineWidth = 1;

    // ✅ 기존 로직: 각 부반송파를 다른 색상으로 표시
    for (let sc = 0; sc < subcarrierCount; sc++) {
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${(sc * 20) % 360}, 70%, 60%)`;

      buffer.forEach((packet, idx) => {
        const val = packet[sc];
        const x = idx * stepX;
        const y = scaleY(val);

        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();
    }
  }, [buffer]);

  return (
    <div className="w-full h-full bg-black rounded-lg relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        style={{ width: "100%", height: "100%" }}
      />

      <div className="absolute top-2 left-2 bg-slate-900/70 px-2 py-1 rounded text-xs text-white">
        WiFi CSI Graph {sensorId ? `(Sensor ${sensorId})` : ""}
      </div>

      {/* 데이터 없음 표시 */}
      {buffer.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
          <div className="text-center">
            <div className="animate-pulse">⏳</div>
            <div className="mt-2">WiFi CSI 데이터 대기 중...</div>
            <div className="text-xs mt-1">센서 ID: {sensorId || "Unknown"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
