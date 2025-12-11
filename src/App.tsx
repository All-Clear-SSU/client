// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { PriorityList } from "./components/PriorityList";
import { CCTVMultiView } from "./components/CCTVMultiView";
import { DetailPanel } from "./components/DetailPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

import type { Survivor, Detection } from "./lib/api";
import { fetchSurvivors, updateRescueStatus, deleteSurvivor } from "./lib/api";

import { getStompClient } from "./lib/socket";
import type { IMessage, StompSubscription } from "@stomp/stompjs";

// 🔥 기존 코드 (주석처리) - 라이브 스트림 API는 동적 URL 생성으로 대체됨
// import {
//   startLiveStream,
//   getLiveStreamUrl,
// } from "./lib/liveStreamApi";

export default function App() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clientRef = useRef(getStompClient());
  const subsRef = useRef<Record<string, StompSubscription>>({});
  const connectedRef = useRef(false);

  // ✅ 타임아웃 설정 (60초)
  const CCTV_TIMEOUT_MS = 60 * 1000; // 60초
  const WIFI_TIMEOUT_MS = 60 * 1000; // 60초

  /** ---------- helpers ---------- */
  const sortAndRank = (arr: Survivor[]) => {
    // WiFi 센서 생존자와 CCTV 생존자를 분리
    const wifiSurvivors = arr.filter(s => s.detectionMethod === 'wifi');
    const cctvSurvivors = arr.filter(s => s.detectionMethod !== 'wifi');

    // ✅ WiFi 센서별로 그룹화하여 하나만 선택
    const wifiMap = new Map<string, Survivor>();
    for (const survivor of wifiSurvivors) {
      if (survivor.wifiSensorId) {
        const existing = wifiMap.get(survivor.wifiSensorId);
        // 첫 번째로 발견된 생존자만 저장
        if (!existing) {
          wifiMap.set(survivor.wifiSensorId, survivor);
        }
      }
    }
    const uniqueWifiSurvivors = Array.from(wifiMap.values());

    // ✅ CCTV 생존자만 위험도 순으로 정렬
    const sortedCctv = cctvSurvivors.sort((a, b) => b.riskScore - a.riskScore);

    // WiFi 센서 생존자를 맨 위로, 그 다음 CCTV 생존자
    const sorted = [...uniqueWifiSurvivors, ...sortedCctv];

    // ✅ 순위 부여: WiFi 생존자는 rank 0으로 표시 (번호 없음 의미), CCTV는 1번부터
    let cctvRank = 1;
    return sorted.map((s) => {
      if (s.detectionMethod === 'wifi') {
        return { ...s, rank: 0 }; // WiFi는 rank 0
      } else {
        return { ...s, rank: cctvRank++ }; // CCTV는 1부터 증가
      }
    });
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
            // ✅ WebSocket으로 업데이트된 실시간 데이터 보존
            return old ? {
              ...n,
              riskScore: old.riskScore,
              lastDetection: old.lastDetection,  // ✅ Detection 보존
              hlsUrl: old.hlsUrl,  // ✅ HLS URL 보존
              poseLabel: old.poseLabel,  // ✅ Pose 정보 보존
              poseConfidence: old.poseConfidence,  // ✅ Confidence 보존
              wifiSensorId: old.wifiSensorId,  // ✅ WiFi 센서 ID 보존
              currentSurvivorDetected: old.currentSurvivorDetected,  // ✅ WiFi 탐지 상태 보존
              lastSurvivorDetectedAt: old.lastSurvivorDetectedAt,  // ✅ WiFi 마지막 탐지 시간 보존
              wifiRealtimeData: old.wifiRealtimeData,  // ✅ WiFi 실시간 데이터 보존
              lastCctvDetectedAt: old.lastCctvDetectedAt,  // ✅ CCTV 마지막 탐지 시간 보존
            } : n;
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

  /** ---------- ✅ 타임아웃 기반 자동 제거 ---------- */
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      const survivorsToRemove: string[] = [];

      for (const survivor of survivors) {
        // CCTV 생존자: 마지막 탐지 시간 체크
        if (survivor.detectionMethod === 'cctv' && survivor.lastCctvDetectedAt) {
          const timeSinceLastDetection = now.getTime() - survivor.lastCctvDetectedAt.getTime();
          if (timeSinceLastDetection > CCTV_TIMEOUT_MS) {
            console.log(`⏱️ CCTV 생존자 ${survivor.id} 타임아웃 (${Math.floor(timeSinceLastDetection / 1000)}초)`);
            survivorsToRemove.push(survivor.id);
          }
        }

        // WiFi 생존자: 마지막 생존자 탐지 시간 체크
        if (survivor.detectionMethod === 'wifi' && survivor.lastSurvivorDetectedAt) {
          // currentSurvivorDetected가 false이고, 마지막 탐지 시간이 오래된 경우
          if (!survivor.currentSurvivorDetected) {
            const timeSinceLastDetection = now.getTime() - survivor.lastSurvivorDetectedAt.getTime();
            if (timeSinceLastDetection > WIFI_TIMEOUT_MS) {
              console.log(`⏱️ WiFi 생존자 ${survivor.id} 타임아웃 (${Math.floor(timeSinceLastDetection / 1000)}초)`);
              survivorsToRemove.push(survivor.id);
            }
          }
        }
      }

      // 타임아웃된 생존자 제거
      for (const id of survivorsToRemove) {
        try {
          await deleteSurvivor(id);
          setSurvivors((prev) => prev.filter((s) => s.id !== id));
          if (selectedId === id) setSelectedId(null);
          toast.info(`생존자 #${id} 화면에서 벗어남 (자동 제거)`);
        } catch (err) {
          console.error(`생존자 ${id} 제거 실패:`, err);
        }
      }
    }, 10000); // 10초마다 체크

    return () => clearInterval(interval);
  }, [survivors, selectedId, CCTV_TIMEOUT_MS, WIFI_TIMEOUT_MS]);

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
              prev.map((x) => {
                if (x.id !== data.id) return x;

                // ✅ lastDetection을 제외하고 나머지만 업데이트
                const { lastDetection, ...restData } = data;
                return {
                  ...x,
                  ...restData,
                  // 기존 lastDetection 명시적으로 유지
                  lastDetection: x.lastDetection
                };
              })
            );
          }
        );
        subsRef.current[`${id}-survivor`] = sub;
      }

      /** Detection 처리 + 라이브 스트림 시작 */
      if (!subsRef.current[`${id}-detection`]) {
        const topic = `/topic/survivor/${id}/detections`;

        const sub = client.subscribe(topic, async (msg: IMessage) => {
          let data: any;
          try {
            data = JSON.parse(msg.body);
          } catch {
            console.error("❌ JSON.parse 실패");
            return;
          }

          // 기본 정보 업데이트
          setSurvivors((prev) => {
            const updated = prev.map((x) => {
              if (x.id !== String(data.survivorId)) return x;

              // ✅ CCTV Detection인 경우 마지막 탐지 시간 업데이트
              const isCctvDetection = data.detectionType === 'CCTV' || data.cctvId;

              return {
                ...x,
                lastDetection: data,
                poseLabel: data.detectedStatus ?? x.poseLabel,
                poseConfidence: data.confidence ?? x.poseConfidence,
                wifiSensorId: data.wifiSensorId ? String(data.wifiSensorId) : x.wifiSensorId,
                // ✅ CCTV Detection 시 마지막 탐지 시간 기록
                lastCctvDetectedAt: isCctvDetection ? new Date() : x.lastCctvDetectedAt,
              };
            });

            return updated;
          });

          // ✅ WiFi Detection인 경우, WiFi 신호 구독 추가
          if (data.wifiSensorId && !subsRef.current[`${data.survivorId}-wifi-signal`]) {
            const wifiSensorId = String(data.wifiSensorId);
            const wifiTopic = `/topic/wifi-sensor/${wifiSensorId}/signal`;

            const wifiSub = client.subscribe(wifiTopic, (msg: IMessage) => {
              try {
                const wifiData = JSON.parse(msg.body);
                const targetSensorId = String(wifiData.sensor_id);

                setSurvivors((prev) => {
                  const updated = prev.map((x) => {
                    if (x.wifiSensorId !== targetSensorId) return x;

                    const survivorDetected = wifiData.survivor_detected === true;
                    const now = new Date();

                    // amplitude 배열을 CSI 데이터로 사용
                    const csiDataStr = wifiData.amplitude
                      ? (Array.isArray(wifiData.amplitude) ? wifiData.amplitude.join(',') : String(wifiData.amplitude))
                      : wifiData.csi_data;

                    const realtimeData = {
                      timestamp: wifiData.timestamp || new Date().toISOString(),
                      csi_data: csiDataStr || wifiData.csi_data,
                      analysis_result: wifiData.analysis_result,
                      detected_status: wifiData.detected_status,
                      survivor_detected: survivorDetected,
                    };

                    return {
                      ...x,
                      currentSurvivorDetected: survivorDetected,
                      lastSurvivorDetectedAt: survivorDetected ? now : x.lastSurvivorDetectedAt,
                      wifiRealtimeData: realtimeData,
                    };
                  });

                  return sortAndRank(updated);
                });
              } catch (err) {
                console.error("❌ WiFi 신호 파싱 실패:", err);
              }
            });

            subsRef.current[`${data.survivorId}-wifi-signal`] = wifiSub;
          }

          // 🔥 기존 코드 (주석처리) - 라이브 스트림 API 호출은 불필요 (동적 URL 생성 사용)
          // if (typeof data.cctvId === "number") {
          //   console.log("🎥 live stream start for CCTV", data.cctvId);
          //   const ok = await startLiveStream(data.cctvId, data.locationId ?? 1);
          //   if (!ok) {
          //     console.error("❌ startLiveStream 실패");
          //     return;
          //   }
          //   const url = await getLiveStreamUrl(data.cctvId);
          //   if (!url) {
          //     console.error("❌ getLiveStreamUrl 실패");
          //     return;
          //   }
          //   console.log("🎥 FINAL LIVE URL:", url);
          //   setSurvivors((prev) =>
          //     prev.map((x) =>
          //       x.id === String(data.survivorId)
          //         ? { ...x, hlsUrl: url }
          //         : x
          //     )
          //   );
          // }
        });

        subsRef.current[`${id}-detection`] = sub;
      }

      // ✅ WiFi 센서 ID가 있는 생존자에 대해 WiFi 신호 구독 시작
      if (s.wifiSensorId && !subsRef.current[`${id}-wifi-signal`]) {
        const wifiSensorId = String(s.wifiSensorId);
        const wifiTopic = `/topic/wifi-sensor/${wifiSensorId}/signal`;

        const wifiSub = client.subscribe(wifiTopic, (msg: IMessage) => {
          try {
            const wifiData = JSON.parse(msg.body);
            const targetSensorId = String(wifiData.sensor_id);

            setSurvivors((prev) => {
              const updated = prev.map((x) => {
                if (x.wifiSensorId !== targetSensorId) return x;

                const survivorDetected = wifiData.survivor_detected === true;
                const now = new Date();

                // amplitude 배열을 CSI 데이터로 사용
                const csiDataStr = wifiData.amplitude
                  ? (Array.isArray(wifiData.amplitude) ? wifiData.amplitude.join(',') : String(wifiData.amplitude))
                  : wifiData.csi_data;

                const realtimeData = {
                  timestamp: wifiData.timestamp || new Date().toISOString(),
                  csi_data: csiDataStr || wifiData.csi_data,
                  analysis_result: wifiData.analysis_result,
                  detected_status: wifiData.detected_status,
                  survivor_detected: survivorDetected,
                };

                return {
                  ...x,
                  currentSurvivorDetected: survivorDetected,
                  lastSurvivorDetectedAt: survivorDetected ? now : x.lastSurvivorDetectedAt,
                  wifiRealtimeData: realtimeData,
                };
              });

              return sortAndRank(updated);
            });
          } catch (err) {
            console.error("❌ WiFi 신호 파싱 실패:", err);
          }
        });

        subsRef.current[`${id}-wifi-signal`] = wifiSub;
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
      toast.info("처리 완료");
    } catch {
      toast.error("처리 실패");
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
            survivors={survivors}
            onDispatchRescue={handleDispatchRescue}
            onReportFalsePositive={handleReportFalsePositive}
          />
        </div>
      </div>

      <Toaster />
    </div>
  );
}