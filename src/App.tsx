// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { PriorityList } from "./components/PriorityList";
import { CCTVMultiView } from "./components/CCTVMultiView";
import { DetailPanel } from "./components/DetailPanel";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

import type { Survivor } from "./lib/api";
import {
  fetchSurvivors,
  updateRescueStatus,
  deleteSurvivor,
  fetchWifiSensor,
  fetchRecentSurvivors,
  deleteRecentSurvivor,
  type WifiSensor,
  type RecentSurvivorRecord,
  type RecentRecordEvent,
} from "./lib/api";

import { getStompClient } from "./lib/socket";
import type { IMessage, StompSubscription } from "@stomp/stompjs";

export default function App() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wifiSensor1Info, setWifiSensor1Info] = useState<WifiSensor | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [recentRecords, setRecentRecords] = useState<RecentSurvivorRecord[]>([]);
  const [listMode, setListMode] = useState<"realtime" | "recent">("realtime"); // 좌측 탭 전환 상태

  const clientRef = useRef(getStompClient());
  const subsRef = useRef<Record<string, StompSubscription>>({});
  const connectedRef = useRef(false);

  // ✅ 타임아웃 설정
  const CCTV_TIMEOUT_MS = 10 * 1000; // 10초 - CCTV 화면에서 사라진 생존자 빠른 제거 (오탐지 신속 처리 + 일시적 가림 허용)
//  const WIFI_TIMEOUT_MS = 60 * 1000; // 60초(현재 사용하지 않아서 비활성화)

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
    } catch {
      // noop: 파싱 실패 시 숫자 추출 로직으로 진행
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------- WiFi 센서 1 정보 로드 ---------- */
  useEffect(() => {
    async function loadWifiSensor1() {
      try {
        const sensor = await fetchWifiSensor(1);
        if (sensor) {
          setWifiSensor1Info(sensor);
        }
      } catch (err) {
        console.error("WiFi 센서 1 정보 로드 실패:", err);
      }
    }

    loadWifiSensor1();
  }, []);

  /** ---------- 최근 기록 로드 (타임아웃 스냅샷) ---------- */
  useEffect(() => {
    let alive = true;

    async function loadRecent() {
      try {
        const data = await fetchRecentSurvivors(48);
        if (alive) setRecentRecords(data);
      } catch (err) {
        console.error("최근 생존자 기록 로드 실패:", err);
      }
    }

    loadRecent();
    const interval = setInterval(loadRecent, 60000); // 폴백: 60초 주기
    return () => {
      alive = false;
      clearInterval(interval);
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

          // ✅ WiFi 센서 ID 1의 더미 생존자를 항상 추가 (실제 생존자가 없어도 표시)
          const hasWifiSensor1 = merged.some(s => s.wifiSensorId === "1");
          if (!hasWifiSensor1) {
            // WiFi 센서 1의 기존 데이터 보존
            const existingWifiSensor1 = prev.find(p => p.wifiSensorId === "1");

            // ✅ WiFi 센서 1 정보를 API에서 가져온 경우 사용
            const location = wifiSensor1Info?.location?.buildingName || "WiFi 센서";
            const floor = wifiSensor1Info?.location?.floor ?? 0;
            const room = wifiSensor1Info?.location?.fullAddress ||
                         (wifiSensor1Info?.location ? `${wifiSensor1Info.location.floor}층 ${wifiSensor1Info.location.roomNumber}` : "센서 ID: 1");

            // ✅ 기존 생존자가 있으면 업데이트, 없으면 새로 생성
            const wifiSensor1Survivor: Survivor = existingWifiSensor1 ? {
              ...existingWifiSensor1,
              // ✅ 위치 정보 업데이트
              location,
              floor,
              room,
            } : {
              id: "wifi-sensor-1",
              rank: 0,
              location,
              floor,
              room,
              status: "conscious" as const,
              riskScore: 0,
              rescueStatus: "pending" as const,
              detectionMethod: "wifi" as const,
              wifiSensorId: "1",
              currentSurvivorDetected: false,
              lastSurvivorDetectedAt: null,
              wifiRealtimeData: null,
              lastDetection: null,
              lastCctvDetectedAt: null,
              poseLabel: null,
              poseConfidence: null,
              x: 50,
              y: 50,
            };

            merged.push(wifiSensor1Survivor);
          }

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
  }, [selectedId, wifiSensor1Info]); // ✅ wifiSensor1Info가 변경되면 다시 로드

  /** ---------- ID 변경 시 재구독 ---------- */
  useEffect(() => {
    resubscribeAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survivors.map((s) => s.id).join("|"), connectedRef.current]);

  /** ---------- ✅ 타임아웃 기반 자동 제거 ---------- */
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      const survivorsToRemove: string[] = [];

      // ✅ 최신 survivors 상태를 가져오기 위해 setState의 함수형 업데이트 사용
      setSurvivors((currentSurvivors) => {
        for (const survivor of currentSurvivors) {
          // CCTV 생존자: 마지막 탐지 시간 체크
          if (survivor.detectionMethod === 'cctv' && survivor.lastCctvDetectedAt) {
            // Date 객체로 변환 (문자열인 경우 대비)
            const lastDetectedTime = survivor.lastCctvDetectedAt instanceof Date
              ? survivor.lastCctvDetectedAt
              : new Date(survivor.lastCctvDetectedAt);

            const timeSinceLastDetection = now.getTime() - lastDetectedTime.getTime();

            if (timeSinceLastDetection > CCTV_TIMEOUT_MS) {
              survivorsToRemove.push(survivor.id);
            }
          }

          // ✅ WiFi 생존자: 타임아웃 제거 로직 비활성화 (false 신호를 받아도 계속 표시)
          // WiFi 센서는 수동으로만 제거 가능 (오탐지 신고 버튼 사용)
        }

        // 현재 상태를 변경 없이 반환 (제거는 아래에서 수행)
        return currentSurvivors;
      });

          // 타임아웃된 생존자 제거
          for (const id of survivorsToRemove) {
            try {
              await deleteSurvivor(id, "TIMEOUT");
              setSurvivors((prev) => prev.filter((s) => s.id !== id));
              setSelectedId((current) => current === id ? null : current);
              toast.info(`생존자 #${id} 화면에서 벗어남 (자동 제거)`);
            } catch (err) {
              console.error(`❌ 생존자 ${id} 제거 실패:`, err);
        }
      }
    }, 10000); // 10초마다 체크

    return () => clearInterval(interval);
  }, [CCTV_TIMEOUT_MS]); // ✅ survivors를 dependency에서 제거하여 interval 재설정 방지

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
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                // ✅ CCTV Detection 메시지를 받으면 항상 마지막 탐지 시간을 현재 시간으로 업데이트
                // WebSocket으로 Detection 메시지가 온 것 자체가 실시간 탐지를 의미
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

                    // csi_amplitude_summary 배열을 CSI 데이터로 사용
                    const csiAmplitude = wifiData.csi_amplitude_summary || wifiData.amplitude;
                    const csiDataStr = csiAmplitude
                      ? (Array.isArray(csiAmplitude) ? csiAmplitude.join(', ') : String(csiAmplitude))
                      : wifiData.csi_data || wifiData.analysis_result;

                    const realtimeData = {
                      timestamp: wifiData.timestamp || new Date().toISOString(),
                      csi_data: csiDataStr,
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

                // csi_amplitude_summary 배열을 CSI 데이터로 사용
                const csiAmplitude = wifiData.csi_amplitude_summary || wifiData.amplitude;
                const csiDataStr = csiAmplitude
                  ? (Array.isArray(csiAmplitude) ? csiAmplitude.join(', ') : String(csiAmplitude))
                  : wifiData.csi_data || wifiData.analysis_result;

                const realtimeData = {
                  timestamp: wifiData.timestamp || new Date().toISOString(),
                  csi_data: csiDataStr,
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

    // 최근 기록 실시간 구독 (공용 토픽)
    if (!subsRef.current["recent-records"]) {
      const sub = client.subscribe("/topic/recent-survivors", (msg: IMessage) => {
        try {
          const event = JSON.parse(msg.body) as RecentRecordEvent;
          if (event.type === "added" && event.record) {
            setRecentRecords((prev) => {
              const others = prev.filter((r) => r.id !== event.record!.id);
              return [...others, event.record!].sort(
                (a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
              );
            });
          } else if (event.type === "deleted" && event.recordId != null) {
            setRecentRecords((prev) => prev.filter((r) => r.id !== event.recordId));
          }
        } catch (err) {
          console.error("recent-survivors 이벤트 처리 실패:", err);
        }
      });
      subsRef.current["recent-records"] = sub;
    }
  }

  /** ---------- 액션 ---------- */
  const handleDispatchRescue = async (id: string, next: "IN_RESCUE" | "WAITING") => {
    try {
      await updateRescueStatus(id, next);
      setSurvivors((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, rescueStatus: next === "IN_RESCUE" ? "dispatched" : "pending" }
            : s
        )
      );
      toast.success(next === "IN_RESCUE" ? "🚑 구조팀 출동!" : "⏪ 출동 취소, 대기 상태로 전환");
    } catch {
      toast.error("구조 상태 변경 실패");
    }
  };

  const handleDeleteRecentRecord = async (recordId: number) => {
    const confirmed = window.confirm("이 최근 기록을 삭제할까요?");
    if (!confirmed) return;

    try {
      await deleteRecentSurvivor(recordId);
      setRecentRecords((prev) => prev.filter((r) => r.id !== recordId));
      toast.success("최근 기록이 삭제되었습니다.");
    } catch (err) {
      console.error(err);
      toast.error("최근 기록 삭제 실패");
    }
  };

  const handleReportFalsePositive = async (id: string) => {
    try {
      // ✅ WiFi 센서 1의 더미 생존자는 제거할 수 없음
      if (id === "wifi-sensor-1") {
        toast.error("WiFi 센서 1은 제거할 수 없습니다");
        return;
      }

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

  /** ---------- KST 시계 ---------- */
  useEffect(() => {
    const formatterTime = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    });

    const formatterDate = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    });

    const tick = () => {
      const now = new Date();
      setCurrentTime(formatterTime.format(now));
      setCurrentDate(formatterDate.format(now));
    };

    tick(); // 초기 1회
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /** ---------- 렌더 ---------- */
  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
      <Header
        currentTime={currentTime}
        currentDate={currentDate}
        alertLevel={alertLevel}
        totalSurvivors={survivors.length}
      />

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        <div className="col-span-2 h-full overflow-y-auto">
          <PriorityList
            survivors={survivors}
            selectedId={selectedId}
            onSelect={setSelectedId}
            recentRecords={recentRecords}
            mode={listMode}
            onModeChange={setListMode}
            onDeleteRecent={handleDeleteRecentRecord}
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
