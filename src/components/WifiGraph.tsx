// src/components/WifiGraph.tsx
import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

// MQTT 설정
const MQTT_BROKER = "wss://wyjae.sytes.net:8084"; // ← WebSocket 포트 필요 (예시)
const MQTT_TOPIC = "PROTO/ESP/1";

// CSI 세부 설정
const SUBCARRIERS_RAW = 43;
const INDICES_TO_REMOVE = Array.from({ length: 9 }, (_, i) => i + 26);
const WINDOW_SIZE = 150; // 최근 N 패킷만 표시

interface WifiGraphProps {
  sensorId?: string; // survivor에 연결된 wifi sensor id
}

export default function WifiGraph({ sensorId }: WifiGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [buffer, setBuffer] = useState<number[][]>([]); // 2D: [packet][subcarriers]

  /** MQTT 연결 */
  useEffect(() => {
    console.log("🔌 MQTT Connecting:", MQTT_BROKER);

    const client = mqtt.connect(MQTT_BROKER, {
      reconnectPeriod: 2000,
    });

    client.on("connect", () => {
      console.log("📡 MQTT Connected!");
      client.subscribe(MQTT_TOPIC);
    });

    client.on("message", (_, payload) => {
      try {
        const text = payload.toString();
        const csiLine = text
          .split("\n")
          .find((line) => line.trim().startsWith("CSI values:"));

        if (!csiLine) return;

        const nums = csiLine
          .replace("CSI values:", "")
          .trim()
          .split(" ")
          .map((v) => parseFloat(v))
          .filter((n) => !isNaN(n));

        if (nums.length % 2 !== 0) return;

        // complex -> amplitude
        let amplitudesFull: number[] = [];
        for (let i = 0; i < nums.length; i += 2) {
          amplitudesFull.push(Math.sqrt(nums[i] ** 2 + nums[i + 1] ** 2));
        }

        const useAmps = amplitudesFull
          .slice(0, SUBCARRIERS_RAW)
          .filter((_, idx) => !INDICES_TO_REMOVE.includes(idx));

        setBuffer((prev) => {
          const next = [...prev, useAmps];
          if (next.length > WINDOW_SIZE) next.shift();
          return next;
        });
      } catch (err) {
        console.error("❌ MQTT message parse error", err);
      }
    });

    return () => {
      client.end();
    };
  }, []);

  /** Canvas 렌더링 */
  useEffect(() => {
    if (!canvasRef.current || buffer.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;

    const subcarrierCount = buffer[0].length;

    ctx.clearRect(0, 0, width, height);

    // Normalize
    const flat = buffer.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);

    const scaleY = (v: number) =>
      height - ((v - min) / (max - min)) * (height - 20);

    const stepX = width / WINDOW_SIZE;

    ctx.lineWidth = 1;

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
        WiFi CSI Graph {sensorId ? `(${sensorId})` : ""}
      </div>
    </div>
  );
}