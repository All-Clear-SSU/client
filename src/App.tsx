// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { PriorityList } from "./components/PriorityList";
import { CCTVMultiView } from "./components/CCTVMultiView";
import { DetailPanel } from "./components/DetailPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

import type { Survivor } from "./lib/api";
import { fetchSurvivors, updateRescueStatus, deleteSurvivor } from "./lib/api";

import { getStompClient } from "./lib/socket";
import type { IMessage, StompSubscription } from "@stomp/stompjs";

// ✅ NEW: 라이브 스트리밍 API
import {
  startLiveStream,
  getLiveStreamUrl,
} from "./lib/liveStreamApi";

export default function App() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clientRef = useRef(getStompClient());
  const subsRef = useRef<Record<string, StompSubscription>>({});
  const connectedRef = useRef(false);

  /** ---------- helpers ---------- */
  const sortAndRank = (arr: Survivor[]) => {
    const sorted = [...arr].sort((a, b) => b.riskScore - a.riskScore);
    return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
  };

  const parseScore = (raw: string): number | null => {
    const quick = Number(raw);
    if (Number.isFinite(quick)) return quick;

    try {
      const j = JSON.parse(raw);
      if (typeof j === "number") return j;
      if (typeof j?.finalRiskScore === "number") return j.finalRiskScore;
      if (typeof j?.score === "number") return j.score;
    } catch {}

    const m = raw.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  /** ---------- STOMP 연결 ---------- */
  useEffect(() => {
    const client = clientRef.current;

    client.onConnect = () => {
      connectedRef.current = true;
      console.log(" STOMP connected");
      resubscribeAll();
    };

    client.onStompError = (frame) => {
      console.error("STOMP ERROR:", frame.headers["message"], frame.body);
    };

    client.onWebSocketClose = () => {
      console.warn("🔌 WS closed");
      connectedRef.current = false;
    };

    client.activate();

    return () => {
      Object.values(subsRef.current).forEach((sub) => sub?.unsubscribe?.());
      subsRef.current = {};
      connectedRef.current = false;
      client.deactivate();
    };
  }, []);

  /** ---------- 생존자 목록 로드 ---------- */
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const data = await fetchSurvivors();

        setSurvivors((prev) => {
          const merged = data.map((n) => {
            const old = prev.find((p) => p.id === n.id);
            return old ? { ...n, riskScore: old.riskScore } : n;
          });
          return sortAndRank(merged);
        });

        if (alive && !selectedId && data.length > 0) {
          setSelectedId((cur) => cur ?? data[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    }

    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selectedId]);

  /** ---------- ID 변경 시 재구독 ---------- */
  useEffect(() => {
    resubscribeAll();
  }, [survivors.map((s) => s.id).join("|"), connectedRef.current]);

  /** ---------- WebSocket 구독 관리 ---------- */
  function resubscribeAll() {
    const client = clientRef.current;
    if (!connectedRef.current || !client.connected) return;

    const currentIds = new Set(survivors.map((s) => s.id));

    // 기존 구독 제거
    for (const key of Object.keys(subsRef.current)) {
      const id = key.split("-")[0];
      if (!currentIds.has(id)) {
        subsRef.current[key]?.unsubscribe?.();
        delete subsRef.current[key];
      }
    }

    // 신규 생존자 구독
    for (const s of survivors) {
      const id = String(s.id);

      /** 점수 업데이트 */
      if (!subsRef.current[`${id}-scores`]) {
        const sub = client.subscribe(
          `/topic/survivor/${id}/scores`,
          (msg: IMessage) => {
            const score = parseScore(String(msg.body));
            if (score == null) return;

            setSurvivors((prev) =>
              sortAndRank(
                prev.map((x) =>
                  x.id === id ? { ...x, riskScore: score } : x
                )
              )
            );
          }
        );
        subsRef.current[`${id}-scores`] = sub;
      }

      /** Survivor 정보 업데이트 */
      if (!subsRef.current[`${id}-survivor`]) {
        const sub = client.subscribe(
          `/topic/survivor/${id}`,
          (msg: IMessage) => {
            const data = JSON.parse(msg.body);
            setSurvivors((prev) =>
              prev.map((x) => (x.id === data.id ? { ...x, ...data } : x))
            );
          }
        );
        subsRef.current[`${id}-survivor`] = sub;
      }

      /** Detection 처리 + 라이브 스트림 시작 */
      if (!subsRef.current[`${id}-detection`]) {
        const topic = `/topic/survivor/${id}/detections`;

        const sub = client.subscribe(topic, async (msg: IMessage) => {
          console.log("🔥 [WS detection raw]", topic, msg.body);

          let data: any;
          try {
            data = JSON.parse(msg.body);
          } catch {
            console.error("❌ JSON.parse 실패");
            return;
          }

          console.log("🔥 [WS detection parsed]", data);

          // 기본 정보 업데이트
          setSurvivors((prev) =>
            prev.map((x) =>
              x.id === String(data.survivorId)
                ? {
                    ...x,
                    lastDetection: data,
                    poseLabel: data.detectedStatus ?? x.poseLabel,
                    poseConfidence: data.confidence ?? x.poseConfidence,
                  }
                : x
            )
          );

          /** -------------------------------
           *  ⭐ NEW: 라이브 스트리밍 처리 ⭐
           * ------------------------------- */

          if (typeof data.cctvId === "number") {
            console.log("🎥 live stream start for CCTV", data.cctvId);

            // 1) 스트리밍 시작 API 호출
            const ok = await startLiveStream(data.cctvId, data.locationId ?? 1);
            if (!ok) {
              console.error("❌ startLiveStream 실패");
              return;
            }

            // 2) 스트림 URL 가져오기
            const url = await getLiveStreamUrl(data.cctvId);
            if (!url) {
              console.error("❌ getLiveStreamUrl 실패");
              return;
            }

            console.log("🎥 FINAL LIVE URL:", url);

            // 3) 생존자 데이터에 hlsUrl 저장
            setSurvivors((prev) =>
              prev.map((x) =>
                x.id === String(data.survivorId)
                  ? { ...x, hlsUrl: url }
                  : x
              )
            );
          }
        });

        subsRef.current[`${id}-detection`] = sub;
      }
    }
  }

  /** ---------- 액션 ---------- */
  const handleDispatchRescue = async (id: string) => {
    try {
      await updateRescueStatus(id, "IN_RESCUE");
      setSurvivors((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, rescueStatus: "dispatched" } : s
        )
      );
      toast.success("🚑 구조팀 출동!");
    } catch {
      toast.error("구조팀 파견 실패");
    }
  };

  const handleReportFalsePositive = async (id: string) => {
    try {
      await deleteSurvivor(id);
      setSurvivors((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.info("오탐 처리 완료");
    } catch {
      toast.error("오탐 처리 실패");
    }
  };

  /** ---------- 선택된 생존자 ---------- */
  const selectedSurvivor =
    survivors.find((s) => s.id === selectedId) || null;

  const pendingCount = survivors.filter(
    (s) => s.rescueStatus === "pending"
  ).length;

  const alertLevel =
    pendingCount >= 5 ? "high" : pendingCount >= 3 ? "medium" : "low";

  /** ---------- 렌더 ---------- */
  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
      <Header
        currentTime="15:29:14"
        alertLevel={alertLevel}
        totalSurvivors={survivors.length}
      />

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        <div className="col-span-2 h-full overflow-y-auto">
          <PriorityList
            survivors={survivors}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="col-span-6 h-full overflow-y-auto">
          <CCTVMultiView
            survivors={survivors}
            selectedId={selectedId}
            onSelectSurvivor={setSelectedId}
          />
        </div>

        <div className="col-span-4 overflow-y-auto">
          <DetailPanel
            survivor={selectedSurvivor}
            onDispatchRescue={handleDispatchRescue}
            onReportFalsePositive={handleReportFalsePositive}
          />
        </div>
      </div>

      <Toaster />
    </div>
  );
}