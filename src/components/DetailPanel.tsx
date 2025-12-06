// src/components/DetailPanel.tsx
import { Camera, Send, XCircle, Activity, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { useEffect, useState, useRef } from "react";
import Hls from "hls.js";

import type { Survivor } from "../lib/api";
import { fetchAiAnalysis, type AiAnalysis } from "../lib/api";

interface DetailPanelProps {
  survivor: Survivor | null;
  onDispatchRescue: (id: string) => void;
  onReportFalsePositive: (id: string) => void;
}

export function DetailPanel({
  survivor,
  onDispatchRescue,
  onReportFalsePositive,
}: DetailPanelProps) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);

  // ----------------------------------------------------------
  // 🔥 HLS.js 재생 로직
  // ----------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // 🔥 테스트용: 항상 CCTV 1번 스트림을 재생
  const TEST_HLS_URL =
    "http://16.184.55.244:8080/streams/cctv1/playlist.m3u8";

  // ❗ DetailPanel에서도 고정 URL만 사용
  const effectiveUrl = TEST_HLS_URL;

  // ----------------------------------------------------------
  // 🔥 survivor 변경 → AI 분석 정보 불러오기
  // ----------------------------------------------------------
  useEffect(() => {
    if (!survivor) return;

    fetchAiAnalysis(survivor.id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
  }, [survivor?.id, survivor?.riskScore]);

  // ----------------------------------------------------------
  // 🔥 DetailPanel 비디오에서도 HLS.js attach/destroy
  // ----------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!effectiveUrl || !video) {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      return;
    }

    if (Hls.isSupported()) {
      if (!hlsRef.current) {
        hlsRef.current = new Hls({ enableWorker: true });
      }

      const hls = hlsRef.current;
      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error(
          "[HLS ERROR - DetailPanel]",
          data.type,
          data.details,
          data.response?.code,
          effectiveUrl
        );
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = effectiveUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [effectiveUrl, survivor?.id]);

  // ----------------------------------------------------------
  // 🔥 생존자 선택 안된 경우
  // ----------------------------------------------------------
  if (!survivor) {
    return (
      <div className="h-full bg-slate-900 border-l border-slate-700 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>생존자를 선택하세요</p>
          <p className="text-sm mt-1">상세 정보를 확인할 수 있습니다</p>
        </div>
      </div>
    );
  }

  const last = survivor.lastDetection;
  const isDispatched = survivor.rescueStatus === "dispatched";
  const isRescued = survivor.rescueStatus === "rescued";
  const finalRisk = survivor.riskScore;

  const riskColor =
    finalRisk >= 18
      ? "text-red-500"
      : finalRisk >= 12
      ? "text-orange-500"
      : "text-green-500";

  return (
    <div className="h-full bg-slate-900 border-l border-slate-700 flex flex-col min-w-[380px] shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 shrink-0">
        <h2 className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          상세 정보
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          생존자 #{analysis?.survivorNumber ?? survivor.id}
        </p>
      </div>

      <ScrollArea className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* ----------------------------------------------------
           📌 CCTV 스트리밍 (HLS.js 버전)
        ---------------------------------------------------- */}
        <section className="shrink-0">
          <label className="text-slate-300 flex items-center gap-2 mb-2">
            <Camera className="w-4 h-4" />
            실시간 CCTV
          </label>

          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full h-[220px] overflow-hidden relative">
            {effectiveUrl ? (
              <video
                key={effectiveUrl + (survivor?.id ?? "")}  // 👈 생존자 변경 시 강제 리렌더링
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover rounded"
                autoPlay
                muted
                playsInline
                controls
                controlsList="nofullscreen"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <Camera className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>
                    {survivor.location} - {survivor.room}
                  </p>
                  <p className="text-xs opacity-50">Camera Feed Placeholder</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <Separator className="bg-slate-700" />

        {/* 실시간 감지 정보 */}
        <section className="shrink-0 bg-slate-800 rounded-lg p-3 text-sm space-y-2">
          <h3 className="text-slate-300 font-medium mb-2">📡 실시간 감지 정보</h3>

          <div className="flex justify-between">
            <span className="text-slate-400">자세</span>
            <span className="text-white font-medium wrap-break-word">
              {last?.detectedStatus ?? "-"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Confidence</span>
            <span className="text-white font-medium">
              {last?.confidence ? (last.confidence * 100).toFixed(1) + "%" : "-"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">분석 시간</span>
            <span className="text-slate-300">
              {last?.detectedAt
                ? new Date(last.detectedAt).toLocaleString()
                : "-"}
            </span>
          </div>

          {last?.aiAnalysisResult && (
            <div className="pt-2">
              <span className="text-slate-400">AI 모델 결과</span>
              <p className="text-slate-300 mt-1 wrap-break-word">
                {last.aiAnalysisResult}
              </p>
            </div>
          )}
        </section>

        <Separator className="bg-slate-700" />

        {/* AI 분석 */}
        <section className="shrink-0">
          <h3 className="text-slate-300 mb-2">🤖 AI 분석 리포트</h3>

          <div className="bg-slate-800 rounded-lg p-3 space-y-3 text-sm">
            <div>
              <div className="text-slate-400 text-sm mb-1">상황 해석</div>
              <p className="text-slate-300 break-all whitespace-pre-line">
                {analysis?.aiAnalysisResult ?? "AI 분석 데이터를 불러오는 중..."}
              </p>
            </div>

            <Separator className="bg-slate-700" />

            <div className="flex justify-between">
              <span className="text-slate-400">상태 점수</span>
              <span className="text-white">
                {analysis?.statusScore?.toFixed(1) ?? "-"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">환경 점수</span>
              <span className="text-white">
                {analysis?.environmentScore?.toFixed(1) ?? "-"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">신뢰도 계수</span>
              <span className="text-white">
                {analysis?.confidenceCoefficient?.toFixed(2) ?? "-"}
              </span>
            </div>

            <Separator className="bg-slate-700" />

            <div className="flex justify-between font-medium">
              <span className="text-slate-300">최종 위험도</span>
              <span className={riskColor}>{finalRisk.toFixed(1)} 점</span>
            </div>
          </div>
        </section>
      </ScrollArea>

      {/* Buttons */}
      <div className="p-4 border-t border-slate-700 space-y-2 shrink-0">
        <Button
          onClick={() => onDispatchRescue(survivor.id)}
          disabled={isDispatched || isRescued}
          className={`w-full font-semibold ${
            isRescued
              ? `bg-slate-600 text-white cursor-not-allowed`
              : isDispatched
              ? `bg-blue-600 text-white border border-blue-400 cursor-default`
              : `bg-blue-500 hover:bg-blue-600 text-white`
          }`}
        >
          <Send className="w-4 h-4 mr-2" />
          {isRescued ? "구조 완료됨" : isDispatched ? "출동 중..." : "구조팀 파견"}
        </Button>

        <Button
          variant="outline"
          className="w-full border-red-600 text-red-400 hover:bg-red-600 hover:text-white transition"
          onClick={() => onReportFalsePositive(survivor.id)}
          disabled={isRescued}
        >
          <XCircle className="w-4 h-4 mr-2" />
          오탐(False Positive) 보고
        </Button>
      </div>
    </div>
  );
}