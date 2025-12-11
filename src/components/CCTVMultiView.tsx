// src/components/CCTVMultiView.tsx
import { useEffect, useRef } from "react";
import Hls from "hls.js";

import { Camera, AlertTriangle, MapPin, Activity, Wifi } from "lucide-react";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import type { Survivor } from "../lib/api";
import WifiGraph from "./WifiGraph";

interface CCTVMultiViewProps {
  survivors: Survivor[];
  selectedId: string | null;
  onSelectSurvivor: (id: string) => void;
}

const statusIcons = {
  unconscious: "🛌",
  injured: "🤕",
  trapped: "🚪",
  conscious: "👤",
  lying: "누워 있음",
  standing: "🚶‍♂️",
} as const;

const statusText = {
  unconscious: "쓰러져 있음",
  injured: "부상",
  trapped: "갇힘",
  conscious: "의식 있음",
  lying: "누워 있음",
  standing: "서 있음",
} as const;

type CctvTileProps = {
  survivor: Survivor;
  isSelected: boolean;
  onClick: () => void;
};

function CctvTile({ survivor, isSelected, onClick }: CctvTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

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
      urlRef.current = cctvId
        ? `${import.meta.env.VITE_API_BASE || "http://16.184.55.244:8080"}/streams/cctv${cctvId}/playlist.m3u8`
        : undefined;
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

    if (!effectiveUrl || !video) {
      // URL이 없으면 HLS 정리
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
        currentLoadedUrlRef.current = undefined;
      }
      return;
    }

    // ✅ 핵심: 이미 같은 URL이 로드되어 있으면 아무것도 하지 않음
    if (currentLoadedUrlRef.current === effectiveUrl && hlsRef.current) {
      return;
    }

    currentLoadedUrlRef.current = effectiveUrl;

    if (Hls.isSupported()) {
      // ✅ HLS 인스턴스 재사용: 이미 있으면 loadSource만 호출
      if (hlsRef.current) {
        // 기존 HLS 인스턴스가 있으면 URL만 변경
        hlsRef.current.loadSource(effectiveUrl);
      } else {
        // 처음 생성할 때만 새 인스턴스 생성
        hlsRef.current = new Hls({
          enableWorker: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });

        const hls = hlsRef.current;
        hls.loadSource(effectiveUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_, data) => {
          console.error(
            "[HLS ERROR]",
            data.type,
            data.details,
            data.response?.code,
            effectiveUrl
          );
        });
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = effectiveUrl;
    }

    // ✅ cleanup 시 destroy하지 않음 - 컴포넌트 언마운트 시에만 정리
    return () => {
      // 아무것도 하지 않음 - HLS 인스턴스 유지
    };
  }, [effectiveUrl]);

  // ✅ 컴포넌트 언마운트 시에만 HLS 정리
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
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
            {/* ✅ WiFi 생존자는 WiFi 아이콘, CCTV 생존자는 번호 표시 */}
            {isWifiDetection ? (
              <Wifi className={`w-4 h-4 ${riskTextColor} ${wifiStatus === 'detected' ? "animate-pulse" : ""}`} />
            ) : (
              <span className="text-white">{survivor.rank}.</span>
            )}
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
              <span className={riskTextColor}>{survivor.riskScore.toFixed(1)}</span>
            )}
          </div>

          <Badge
            variant="outline"
            className={`text-xs ${
              survivor.rescueStatus === "rescued"
                ? "text-green-400 border-green-400"
                : survivor.rescueStatus === "dispatched"
                ? "text-white border-blue-600 bg-blue-600"
                : "text-slate-300 border-slate-500"
            }`}
          >
            {survivor.rescueStatus === "rescued"
              ? "구조완료"
              : survivor.rescueStatus === "dispatched"
              ? "출동중"
              : "대기"}
          </Badge>
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
                <p className="text-slate-500 text-xs">Camera {survivor.rank}</p>
                <p className="text-slate-500 text-xs mt-1">
                  스트림 준비 중 (HLS URL 없음)
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

      {/* 하단 상태 - WiFi 생존자는 상태 정보 표시 안 함 */}
      <div className="bg-slate-950/80 p-2 border-t border-slate-700">
        {!isWifiDetection ? (
          // CCTV 생존자: 상태 정보 표시
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
          // WiFi 생존자: 빈 공간 유지 (높이 맞추기)
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
  // ✅ 같은 CCTV ID별로 그룹화하고, 가장 위험도 높은 생존자만 선택
  // WiFi 센서 생존자는 WiFi 센서 ID별로 그룹화
  const uniqueSurvivors = (() => {
    const cctvMap = new Map<number, Survivor>();
    const wifiMap = new Map<string, Survivor>();

    for (const survivor of survivors) {
      const cctvId = survivor.lastDetection?.cctvId;
      const wifiSensorId = survivor.wifiSensorId;

      // ✅ WiFi 센서 생존자: WiFi 센서 ID별로 그룹화 (CCTV와 관계없이)
      if (wifiSensorId) {
        const existing = wifiMap.get(wifiSensorId);
        // ✅ WiFi 센서는 우선순위 적용 없이 첫 번째로 발견된 생존자만 저장
        if (!existing) {
          wifiMap.set(wifiSensorId, survivor);
        }
      }
      // CCTV 생존자: CCTV ID별로 그룹화 (WiFi 센서가 아닌 경우만)
      else if (cctvId) {
        const existing = cctvMap.get(cctvId);
        // 해당 CCTV ID의 첫 생존자이거나, 더 높은 위험도를 가진 생존자인 경우 저장
        if (!existing || survivor.riskScore > existing.riskScore) {
          cctvMap.set(cctvId, survivor);
        }
      }
    }

    // ✅ WiFi 생존자를 먼저 배치하고, 그 다음 CCTV 생존자를 위험도 순으로 배치
    const wifiSurvivors = Array.from(wifiMap.values());
    const cctvSurvivors = Array.from(cctvMap.values()).sort((a, b) => b.riskScore - a.riskScore);

    return [...wifiSurvivors, ...cctvSurvivors];
  })();

  const topSurvivors = uniqueSurvivors.slice(0, 6);
  const totalUniqueSources = uniqueSurvivors.length;

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
                key={survivor.id}
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