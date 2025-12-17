// src/components/CCTVMultiView.tsx
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

import { Camera, AlertTriangle, MapPin, Activity, Wifi } from "lucide-react";
// import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import type { Survivor } from "../lib/api";
import { API_BASE, fetchAllCctvs, type CctvInfo } from "../lib/api";
import WifiGraph from "./WifiGraph";

interface CCTVMultiViewProps {
  survivors: Survivor[];
  selectedId: string | null;
  onSelectSurvivor: (id: string) => void;
}

// 고정으로 보여줄 CCTV ID 목록
// const FIXED_CCTV_IDS = [1, 2, 3]; // CCTV 1~3만 고정
// const FIXED_CCTV_IDS = [1, 3, 5]; // CCTV 1~3만 고정
// const FIXED_CCTV_IDS = [1, 2, 3, 4]; // CCTV 1~4만 고정
const FIXED_CCTV_IDS = [1, 2, 3, 4, 5]; // CCTV 1~5 고정
// const FIXED_CCTV_IDS = [1]; // CCTV 1~5 고정


const statusIcons: Record<Survivor["status"], string> = {
  conscious: "👤",
  unconscious: "🛌",
  injured: "🤕",
  trapped: "🚪",
  lying: "🛌",
  standing: "🚶",
  falling: "🛌",
  crawling: "🧎",
  sitting: "🪑🧍",
};

const statusText: Record<Survivor["status"], string> = {
  conscious: "의식 있음",
  unconscious: "쓰러져 있음",
  injured: "부상",
  trapped: "갇힘",
  lying: "누워 있음",
  standing: "서 있음",
  falling: "쓰러져 있음",
  crawling: "기어가고 있음",
  sitting: "앉아 있음",
};

type CctvTileProps = {
  survivor: Survivor;
  tileKey: string;
  isSelected: boolean;
  onClick: () => void;
};

type HlsPoolEntry = {
  hls: Hls;
  currentUrl?: string;
  cleanupTimer?: ReturnType<typeof setTimeout> | null;
};

// HLS 인스턴스를 소스별로 보존해서 타일이 잠깐 사라져도 재생 상태를 유지
const hlsPool = new Map<string, HlsPoolEntry>();

function CctvTile({ survivor, tileKey, isSelected, onClick }: CctvTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔥 기존 코드 (주석처리) - 하드코딩된 CCTV1 URL
  // const TEST_HLS_URL = "http://16.184.55.244:8080/streams/cctv1/playlist.m3u8";
  // const effectiveUrl: string | undefined = TEST_HLS_URL;

  // ✅ 수정된 코드: CCTV ID에 따라 동적으로 HLS URL 생성
  // WiFi 센서 생존자는 WiFi 그래프를 우선 표시하므로 URL 생성하지 않음
  const isWifiSurvivor = !!survivor.wifiSensorId;
  const cctvId = survivor?.lastDetection?.cctvId;
  const prevCctvIdRef = useRef<number | null | undefined>(null);
  const urlRef = useRef<string | undefined>(undefined);

  // WiFi 센서가 아닌 경우에만 CCTV URL 생성
  if (!isWifiSurvivor) {
    // cctvId가 실제로 변경되었을 때만 URL 재생성
    if (prevCctvIdRef.current !== cctvId) {
      prevCctvIdRef.current = cctvId;
      urlRef.current = cctvId ? `${API_BASE}/streams/cctv${cctvId}/playlist.m3u8` : undefined;
    }
  } else {
    // WiFi 센서인 경우 URL을 생성하지 않음
    urlRef.current = undefined;
    prevCctvIdRef.current = null;
  }

  // ✅ WiFi 센서인 경우 effectiveUrl을 항상 undefined로 설정
  const effectiveUrl: string | undefined = isWifiSurvivor ? undefined : urlRef.current;

  // ✅ WiFi 탐지 상태 판단 헬퍼 함수
  const getWifiDetectionStatus = (): 'detected' | 'recent' | 'none' | null => {
    if (!survivor.wifiSensorId) return null;

    const now = new Date();
    const TEN_MINUTES = 10 * 60 * 1000;

    // 현재 탐지 중인 경우
    if (survivor.currentSurvivorDetected === true) {
      return 'detected'; // 생존자 탐지 중
    }

    // 최근 10분 내 탐지 기록이 있는 경우 (currentSurvivorDetected가 false이거나 null/undefined여도 체크)
    if (survivor.lastSurvivorDetectedAt) {
      const lastDetectedTime = survivor.lastSurvivorDetectedAt instanceof Date 
        ? survivor.lastSurvivorDetectedAt.getTime()
        : new Date(survivor.lastSurvivorDetectedAt).getTime();
      
      const timeDiff = now.getTime() - lastDetectedTime;
      
      if (timeDiff < TEN_MINUTES) {
        return 'recent'; // 최근 10분 내 탐지
      }
    }

    // 그 외의 경우 (미탐지 또는 초기 상태)
    return 'none'; // 미탐지
  };

  const wifiStatus = getWifiDetectionStatus();

  /** HLS 연결 관리 */
  const currentLoadedUrlRef = useRef<string | undefined>(undefined); // 현재 로드된 URL 추적

  useEffect(() => {
    const video = videoRef.current;

    const clearRetry = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    if (!effectiveUrl || !video) {
      // URL이 없으면 HLS 정리
      if (hlsRef.current) {
        hlsRef.current.detachMedia();
        currentLoadedUrlRef.current = undefined;
      }
      clearRetry();
      return;
    }

    // ✅ 핵심: 이미 같은 URL이 로드되어 있으면 아무것도 하지 않음
    if (currentLoadedUrlRef.current === effectiveUrl && hlsRef.current) {
      return;
    }

    let entry = hlsPool.get(tileKey);
    if (entry) {
      hlsRef.current = entry.hls;
      currentLoadedUrlRef.current = entry.currentUrl;
      if (entry.cleanupTimer) {
        clearTimeout(entry.cleanupTimer);
        entry.cleanupTimer = null;
      }
    }

    const scheduleRetry = () => {
      clearRetry();
      retryTimeoutRef.current = setTimeout(() => {
        if (hlsRef.current) {
          hlsRef.current.detachMedia();
        }
        currentLoadedUrlRef.current = undefined;
        attachHls();
      }, 1500);
    };

    function attachHls() {
      const v = videoRef.current;
      if (!v || !effectiveUrl) return;

      if (Hls.isSupported()) {
        if (!hlsRef.current) {
          const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          });
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            v.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            console.error(
              "[HLS ERROR]",
              data.type,
              data.details,
              data.response?.code,
              effectiveUrl
            );

            if (!hlsRef.current || !data.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hlsRef.current.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hlsRef.current.recoverMediaError();
            } else {
              scheduleRetry();
            }
          });

          hlsRef.current = hls;
          hlsPool.set(tileKey, { hls, currentUrl: effectiveUrl });
        } else {
          hlsRef.current.attachMedia(v);
          hlsRef.current.startLoad();
        }

        if (currentLoadedUrlRef.current !== effectiveUrl) {
          hlsRef.current.loadSource(effectiveUrl);
          currentLoadedUrlRef.current = effectiveUrl;
          const poolEntry = hlsPool.get(tileKey);
          if (poolEntry) poolEntry.currentUrl = effectiveUrl;
        }
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = effectiveUrl;
        v.play().catch(() => {});
      }
    }

    attachHls();

    // ✅ cleanup 시 destroy하지 않음 - 컴포넌트 언마운트 시에만 정리
    return () => {
      // HLS 인스턴스는 풀에 보존하고, 비디오와만 분리
      if (hlsRef.current) {
        hlsRef.current.detachMedia();
      }
      clearRetry();
    };
  }, [effectiveUrl]);

  // ✅ 컴포넌트 언마운트 시에만 HLS 정리
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.detachMedia();
        const entry = hlsPool.get(tileKey);
        if (entry) {
          entry.cleanupTimer = setTimeout(() => {
            entry.hls.destroy();
            hlsPool.delete(tileKey);
          }, 2 * 60 * 1000); // 2분 후 실제 정리
        } else {
          hlsRef.current.destroy();
        }
        hlsRef.current = null;
      }
    };
  }, []);

  const isWifiDetection = survivor.wifiSensorId != null;

  let riskLevel: "high" | "medium" | "low";
  let riskColor: string;
  let riskTextColor: string;

  if (isWifiDetection) {
    // WiFi 센서는 탐지 상태에 따라 처리
    if (wifiStatus === 'detected') {
      riskLevel = "high";
      riskColor = "border-red-500 bg-red-950/20 animate-pulse";
      riskTextColor = "text-red-500";
    } else if (wifiStatus === 'recent') {
      riskLevel = "medium";
      riskColor = "border-orange-500 bg-orange-950/20";
      riskTextColor = "text-orange-500";
    } else {
      riskLevel = "low";
      riskColor = "border-green-500 bg-green-950/20";
      riskTextColor = "text-green-500";
    }
  } else {
    // CCTV는 위험도 점수 기준
    riskLevel =
      survivor.riskScore >= 3 ? "high" : survivor.riskScore >= 1 ? "medium" : "low";
    riskColor =
      riskLevel === "high"
        ? "border-red-500 bg-red-950/20"
        : riskLevel === "medium"
        ? "border-orange-500 bg-orange-950/20"
        : "border-green-500 bg-green-950/20";
    riskTextColor =
      riskLevel === "high"
        ? "text-red-500"
        : riskLevel === "medium"
        ? "text-orange-500"
        : "text-green-500";
  }

  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-lg border-2 overflow-hidden
        ${riskColor}
        ${
          isSelected
            ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-900"
            : "hover:bg-slate-800/50"
        }
        transition-all cursor-pointer text-left
      `}
    >
      {/* WiFi 센서 생존자 특수 효과 (탐지 중일 때만) */}
      {isWifiDetection && wifiStatus === 'detected' && (
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-500/10 animate-pulse pointer-events-none" />
      )}

      {/* 상단 정보 */}
      <div className="bg-slate-950/80 p-2 border-b border-slate-700 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* ✅ WiFi 생존자는 WiFi 아이콘, CCTV 생존자는 번호 표시 (rank가 0이면 표시 안 함) */}
            {isWifiDetection ? (
              <Wifi className={`w-4 h-4 ${riskTextColor} ${wifiStatus === 'detected' ? "animate-pulse" : ""}`} />
            ) : survivor.rank > 0 ? (
              <span className="text-white">{survivor.rank}.</span>
            ) : null}
            <AlertTriangle
              className={`w-4 h-4 ${riskTextColor} ${isWifiDetection && wifiStatus === 'detected' ? "animate-pulse" : ""}`}
            />
            {isWifiDetection ? (
              wifiStatus === 'detected' ? (
                <span className="text-red-400 font-semibold animate-pulse">생존자 탐지</span>
              ) : wifiStatus === 'recent' ? (
                <span className="text-orange-400 font-semibold">최근 10분 내 생존자 탐지</span>
              ) : (
                <span className="text-green-400">생존자 미탐지</span>
              )
            ) : (
              <span className={riskTextColor}>
                {survivor.riskScore === 0 ? "0.0 (생존자 미탐지)" : survivor.riskScore.toFixed(1)}
              </span>
            )}
          </div>

        </div>

        <div className="flex items-center gap-2 mt-1">
          <MapPin className="w-3 h-3 text-slate-400" />
          <span className="text-slate-300 text-sm">
            {survivor.room}
          </span>
        </div>
      </div>

      {/* CCTV 화면 또는 WiFi 그래프 */}
      <div className="aspect-video bg-slate-800 relative">
        {effectiveUrl ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            autoPlay
            playsInline
            controls
          />
        ) : survivor.wifiSensorId ? (
          <WifiGraph sensorId={survivor.wifiSensorId} />
        ) : (
          <>
            <div className="absolute inset-0 bg-linear-to-br from-slate-700 to-slate-800" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-8 h-8 text-slate-600 mx-auto mb-1" />
                <p className="text-slate-500 text-xs">
                  CCTV {cctvId || survivor.rank || "?"}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {survivor.riskScore === 0 ? "생존자 미탐지" : "스트림 준비 중"}
                </p>
              </div>
            </div>
          </>
        )}

        {/* REC 표시 */}
        <div className="absolute top-2 right-2 bg-red-600 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          REC
        </div>
      </div>

      {/* 하단 상태 - WiFi 생존자와 미탐지 CCTV는 상태 정보 표시 안 함 */}
      <div className="bg-slate-950/80 p-2 border-t border-slate-700">
        {!isWifiDetection && survivor.riskScore > 0 ? (
          // CCTV 생존자 (탐지된 경우만): 상태 정보 표시
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{statusIcons[survivor.status]}</span>
              <span className="text-slate-300 text-sm">
                {statusText[survivor.status]}
              </span>
            </div>

            <div className="flex flex-col items-end text-xs text-slate-400">
              {survivor.poseLabel && <span>자세: {survivor.poseLabel}</span>}
              {typeof survivor.poseConfidence === "number" && (
                <span>Conf: {(survivor.poseConfidence * 100).toFixed(0)}%</span>
              )}
            </div>
          </div>
        ) : (
          // WiFi 생존자 또는 미탐지 CCTV: 빈 공간 유지 (높이 맞추기)
          <div className="h-[28px]"></div>
        )}
      </div>

      {isSelected && (
        <div className="absolute inset-0 pointer-events-none border-4 border-blue-500 rounded-lg" />
      )}
    </button>
  );
}

export function CCTVMultiView({
  survivors,
  selectedId,
  onSelectSurvivor,
}: CCTVMultiViewProps) {
  // ✅ CCTV 위치 정보 로드
  const [cctvInfoMap, setCctvInfoMap] = useState<Map<number, CctvInfo>>(new Map());

  useEffect(() => {
    async function loadCctvInfo() {
      try {
        const cctvs = await fetchAllCctvs();
        const map = new Map<number, CctvInfo>();
        for (const cctv of cctvs) {
          map.set(cctv.id, cctv);
        }
        setCctvInfoMap(map);
      } catch (err) {
        console.error("CCTV 정보 로드 실패:", err);
      }
    }

    loadCctvInfo();
  }, []);

  // ✅ 고정 CCTV ID 목록은 항상 표시 + 생존자 탐지된 경우 해당 생존자 정보 표시
  const fixedCctvs = (() => {
    const fixedIdToIndex = new Map<number, number>();
    FIXED_CCTV_IDS.forEach((id, index) => fixedIdToIndex.set(id, index));
    const fixedSlots: (Survivor | null)[] = Array.from({ length: FIXED_CCTV_IDS.length }, () => null);

    // 실제 생존자 중 고정 CCTV에 해당하는 것 찾기
    for (const survivor of survivors) {
      const cctvId = survivor.lastDetection?.cctvId;
      const targetIndex = cctvId != null ? fixedIdToIndex.get(cctvId) : undefined; // null/undefined 모두 배제
      if (targetIndex !== undefined) {
        const existing = fixedSlots[targetIndex];
        // 같은 CCTV의 생존자가 여러 명이면 위험도 높은 것 선택
        if (!existing || survivor.riskScore > existing.riskScore) {
          fixedSlots[targetIndex] = survivor;
        }
      }
    }

    // ✅ 생존자가 없는 CCTV 슬롯은 더미 생존자 생성 (우선순위 점수 0)
    return fixedSlots.map((survivor, index) => {
      const cctvId = FIXED_CCTV_IDS[index];
      if (survivor) {
        return survivor;
      }

      // ✅ CCTV 위치 정보 가져오기
      const cctvInfo = cctvInfoMap.get(cctvId);
      const location = cctvInfo?.location?.buildingName || `CCTV ${cctvId}`;
      const floor = cctvInfo?.location?.floor ?? 0;
      const room = cctvInfo?.location?.fullAddress ||
                   (cctvInfo?.location ? `${cctvInfo.location.floor}층 ${cctvInfo.location.roomNumber}` : `CCTV ${cctvId} 구역`);

      // 더미 생존자 생성 - 생존자 미탐지 상태여도 스트리밍 표시
      return {
        id: `cctv-${cctvId}-empty`,
        rank: 0,
        riskScore: 0, // ✅ 생존자 미탐지 상태는 점수 0
        location,
        floor,
        room,
        status: "conscious" as const,
        detectionMethod: "cctv" as const,
        rescueStatus: "pending" as const,
        x: 0,
        y: 0,
        // ✅ lastDetection에 cctvId를 명확히 포함하여 스트리밍 URL 생성 가능하도록 수정
        lastDetection: {
          id: 0,
          survivorId: 0,
          cctvId,
          detectionType: "CCTV" as const,
          detectedAt: new Date().toISOString(),
          detectedStatus: "미탐지",
          confidence: 0,
          aiAnalysisResult: "생존자 미탐지 - 실시간 모니터링 중",
          aiModelVersion: "N/A",
          imageUrl: null,
          videoUrl: null,
        },
      } as Survivor;
    });
  })();

  // ✅ WiFi 센서와 나머지 CCTV (5번 이상) 처리
  const { wifiSurvivors, cctvSurvivorsNonFixed } = (() => {
    const wifiMap = new Map<string, Survivor>();
    const cctvMap = new Map<number, Survivor>();
    const fixedIdSet = new Set(FIXED_CCTV_IDS);

    for (const survivor of survivors) {
      const cctvId = survivor.lastDetection?.cctvId;
      const wifiSensorId = survivor.wifiSensorId;

      // WiFi 센서 생존자
      if (wifiSensorId) {
        const existing = wifiMap.get(wifiSensorId);
        if (!existing) {
          wifiMap.set(wifiSensorId, survivor);
        }
      }
      // 고정 CCTV에 포함되지 않는 경우만 추가 표시
      else if (cctvId && !fixedIdSet.has(cctvId)) {
        const existing = cctvMap.get(cctvId);
        if (!existing || survivor.riskScore > existing.riskScore) {
          cctvMap.set(cctvId, survivor);
        }
      }
    }

    return {
      wifiSurvivors: Array.from(wifiMap.values()),
      cctvSurvivorsNonFixed: Array.from(cctvMap.values()).sort((a, b) => b.riskScore - a.riskScore),
    };
  })();

  const getTileKey = (survivor: Survivor) => {
    if (survivor.wifiSensorId) return `wifi-${survivor.wifiSensorId}`;
    if (survivor.lastDetection?.cctvId != null) return `cctv-${survivor.lastDetection.cctvId}`;
    return survivor.id;
  };

  // ✅ WiFi 센서를 상단에 고정 + 고정 CCTV + 나머지 CCTV (비고정)
  // WiFi 센서 개수에 따라 CCTV 표시 개수 조정 (총 6개 유지)
  const remainingSlots = Math.max(6 - wifiSurvivors.length, 0);
  const cctvToShow = remainingSlots >= FIXED_CCTV_IDS.length
    ? [...fixedCctvs, ...cctvSurvivorsNonFixed.slice(0, remainingSlots - FIXED_CCTV_IDS.length)]
    : fixedCctvs.slice(0, remainingSlots);

  const topSurvivors = [...wifiSurvivors, ...cctvToShow];
  const totalUniqueSources = wifiSurvivors.length + fixedCctvs.filter(s => s.riskScore > 0).length + cctvSurvivorsNonFixed.length;

  return (
    <div className="h-full bg-slate-900 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-white flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-500" />
          실시간 CCTV 멀티뷰
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          우선순위 상위 구역 자동 표시 · {topSurvivors.length}개 영상 (전체 {totalUniqueSources}개 탐지원)
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            {topSurvivors.map((survivor) => (
              <CctvTile
                key={getTileKey(survivor)}
                tileKey={getTileKey(survivor)}
                survivor={survivor}
                isSelected={selectedId === survivor.id}
                onClick={() => onSelectSurvivor(survivor.id)}
              />
            ))}
          </div>

          {totalUniqueSources > 6 && (
            <div className="mt-4 bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
              <Activity className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-slate-400 text-sm">
                추가 {totalUniqueSources - 6}개 탐지원에서 생존자가 감지되었습니다
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
