// src/components/CCTVMultiView.tsx
import { useEffect, useRef } from "react";
import Hls from "hls.js";

import { Camera, AlertTriangle, MapPin, Activity } from "lucide-react";
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
  // useRef로 이전 cctvId를 기억하여 실제로 변경될 때만 URL 업데이트
  const cctvId = survivor?.lastDetection?.cctvId;
  const prevCctvIdRef = useRef<number | null | undefined>(null);
  const urlRef = useRef<string | undefined>(undefined);

  // cctvId가 실제로 변경되었을 때만 URL 재생성
  if (prevCctvIdRef.current !== cctvId) {
    console.log(`[MultiView ${survivor.id}] cctvId 변경: ${prevCctvIdRef.current} → ${cctvId}`);
    prevCctvIdRef.current = cctvId;
    urlRef.current = cctvId
      ? `${import.meta.env.VITE_API_BASE || "http://16.184.55.244:8080"}/streams/cctv${cctvId}/playlist.m3u8`
      : undefined;
    console.log(`[MultiView ${survivor.id}] 새 URL 생성:`, urlRef.current);
  }

  const effectiveUrl: string | undefined = urlRef.current;

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

  const riskLevel =
    survivor.riskScore >= 3 ? "high" : survivor.riskScore >= 1 ? "medium" : "low";

  const riskColor =
    riskLevel === "high"
      ? "border-red-500 bg-red-950/20"
      : riskLevel === "medium"
      ? "border-orange-500 bg-orange-950/20"
      : "border-green-500 bg-green-950/20";

  const riskTextColor =
    riskLevel === "high"
      ? "text-red-500"
      : riskLevel === "medium"
      ? "text-orange-500"
      : "text-green-500";

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
      {/* 상단 정보 */}
      <div className="bg-slate-950/80 p-2 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white">{survivor.rank}.</span>
            <AlertTriangle className={`w-4 h-4 ${riskTextColor}`} />
            <span className={riskTextColor}>{survivor.riskScore.toFixed(1)}</span>
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

      {/* 하단 상태 */}
      <div className="bg-slate-950/80 p-2 border-t border-slate-700">
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
  const uniqueCctvSurvivors = (() => {
    const cctvMap = new Map<number, Survivor>();

    for (const survivor of survivors) {
      const cctvId = survivor.lastDetection?.cctvId;

      // CCTV ID가 없는 생존자는 개별적으로 표시
      if (!cctvId) continue;

      const existing = cctvMap.get(cctvId);

      // 해당 CCTV ID의 첫 생존자이거나, 더 높은 위험도를 가진 생존자인 경우 저장
      if (!existing || survivor.riskScore > existing.riskScore) {
        cctvMap.set(cctvId, survivor);
      }
    }

    // Map의 값들을 배열로 변환하고 위험도 순으로 정렬
    return Array.from(cctvMap.values()).sort((a, b) => b.riskScore - a.riskScore);
  })();

  const topSurvivors = uniqueCctvSurvivors.slice(0, 6);
  const totalUniqueCctvs = uniqueCctvSurvivors.length;

  return (
    <div className="h-full bg-slate-900 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-white flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-500" />
          실시간 CCTV 멀티뷰
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          우선순위 상위 구역 자동 표시 · {topSurvivors.length}개 영상 (전체 {totalUniqueCctvs}개 CCTV)
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

          {totalUniqueCctvs > 6 && (
            <div className="mt-4 bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
              <Activity className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-slate-400 text-sm">
                추가 {totalUniqueCctvs - 6}개의 CCTV에서 생존자가 감지되었습니다
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}