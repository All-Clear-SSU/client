// src/components/DetailPanel.tsx
import { Camera, Send, XCircle, Activity, MapPin, Wifi } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { useEffect, useState, useRef, useCallback } from "react";
import Hls from "hls.js";

import type { Survivor } from "../lib/api";
import { API_BASE, fetchAiAnalysis, type AiAnalysis } from "../lib/api";
import { getStompClient } from "../lib/socket";
import type { IMessage, StompSubscription } from "@stomp/stompjs";
import WifiGraph from "./WifiGraph";

interface DetailPanelProps {
  survivor: Survivor | null;
  survivors: Survivor[]; // 전체 생존자 목록 (같은 센서의 다른 생존자 찾기용)
  onDispatchRescue: (id: string) => void;
  onReportFalsePositive: (id: string) => void;
}

export function DetailPanel({
  survivor,
  // survivors,
  onDispatchRescue,
  onReportFalsePositive,
}: DetailPanelProps) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);

  // ----------------------------------------------------------
  // 🔥 HLS.js 재생 로직
  // ----------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ 수정된 코드: CCTV ID에 따라 동적으로 HLS URL 생성
  // useRef로 이전 cctvId를 기억하여 실제로 변경될 때만 URL 업데이트
  const cctvId = survivor?.lastDetection?.cctvId;
  const prevCctvIdRef = useRef<number | null | undefined>(null);
  const urlRef = useRef<string | null>(null);

  // cctvId가 실제로 변경되었을 때만 URL 재생성
  if (prevCctvIdRef.current !== cctvId) {
    prevCctvIdRef.current = cctvId;
    urlRef.current = cctvId ? `${API_BASE}/streams/cctv${cctvId}/playlist.m3u8` : null;
  }

  const effectiveUrl = urlRef.current;

  // ----------------------------------------------------------
  // 🔥 survivor 변경 → AI 분석 정보 불러오기
  // ----------------------------------------------------------
  useEffect(() => {
    if (!survivor) {
      setAnalysis(null);
      return;
    }

    // 초기 AI 분석 정보 로드
    fetchAiAnalysis(survivor.id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survivor?.id]);

  // ----------------------------------------------------------
  // 🔥 WebSocket 실시간 우선순위 점수 업데이트
  // ----------------------------------------------------------
  useEffect(() => {
    if (!survivor || survivor.detectionMethod === 'wifi') return;

    const client = getStompClient();
    let subscription: StompSubscription | null = null;

    const subscribe = () => {
      if (!client.connected) return;

      // ✅ 수정: /topic/survivor/{id}/scores 토픽 구독
      const topic = `/topic/survivor/${survivor.id}/scores`;

      subscription = client.subscribe(topic, async (msg: IMessage) => {
        try {
          // ✅ WebSocket 메시지에서 점수 정보 파싱
          let priorityData: {
            statusScore?: number;
            environmentScore?: number;
            confidenceCoefficient?: number;
            finalRiskScore?: number;
          } | undefined;
          try {
            priorityData = JSON.parse(msg.body);
          } catch {
            // 파싱 실패 시 API 응답만 사용
          }

          // ✅ fetchAiAnalysis 호출하여 모든 최신 분석 정보를 가져옴
          const analysisData = await fetchAiAnalysis(survivor.id);

          // ✅ WebSocket 메시지에서 받은 점수 정보가 있으면 우선 사용
          const updatedAnalysis: AiAnalysis = {
            ...analysisData,
            // WebSocket 메시지의 점수 정보를 API 응답보다 우선 적용
            statusScore: priorityData?.statusScore ?? analysisData.statusScore,
            environmentScore: priorityData?.environmentScore ?? analysisData.environmentScore,
            confidenceCoefficient: priorityData?.confidenceCoefficient ?? analysisData.confidenceCoefficient,
            finalRiskScore: priorityData?.finalRiskScore ?? analysisData.finalRiskScore,
          };

          // 가져온 데이터로 analysis 상태를 직접 업데이트
          setAnalysis(updatedAnalysis);
        } catch (err) {
          console.error(`AI 분석 정보 업데이트 실패:`, err);
        }
      });
    };

    // 연결 대기
    if (client.connected) {
      subscribe();
    } else {
      const existingOnConnect = client.onConnect;
      client.onConnect = (frame) => {
        if (existingOnConnect) {
          existingOnConnect(frame);
        }
        subscribe();
      };

      if (client.connected) {
        subscribe();
      }
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survivor?.id, survivor?.detectionMethod]);

  // ----------------------------------------------------------
  // 🔥 DetailPanel 비디오에서도 HLS.js attach/destroy
  // ----------------------------------------------------------
  const currentLoadedUrlRef = useRef<string | null>(null); // 현재 로드된 URL 추적

  // ✅ video element가 마운트된 후 HLS 초기화
  // useCallback으로 감싸서 불필요한 재생성 방지
  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    const clearRetry = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    if (!effectiveUrl || !video) {
      // URL이 없으면 HLS 정리
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
        currentLoadedUrlRef.current = null;
      }
      clearRetry();
      return;
    }

    // 이미 같은 URL이 로드되어 있으면 아무것도 하지 않음
    if (currentLoadedUrlRef.current === effectiveUrl && hlsRef.current) {
      return;
    }

    currentLoadedUrlRef.current = effectiveUrl;

    const scheduleRetry = () => {
      clearRetry();
      retryTimeoutRef.current = setTimeout(() => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        currentLoadedUrlRef.current = null;
        if (videoRef.current && effectiveUrl) {
          attachHls(videoRef.current);
        }
      }, 1500);
    };

    const attachHls = (target: HTMLVideoElement) => {
      if (!effectiveUrl) return;

      if (Hls.isSupported()) {
        // ✅ HLS 인스턴스 재사용: 이미 있으면 loadSource만 호출
        if (!hlsRef.current) {
          hlsRef.current = new Hls({
            enableWorker: true,
            // ✅ 스트리밍 끊김 방지를 위한 설정
            maxBufferLength: 30,        // 버퍼 길이 증가
            maxMaxBufferLength: 60,     // 최대 버퍼 길이 증가
            liveSyncDuration: 3,        // 라이브 동기화 지연 시간
            liveMaxLatencyDuration: 10, // 최대 지연 시간
          });

          const hls = hlsRef.current;
          hls.attachMedia(target);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            target.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            console.error(
              "[HLS ERROR - DetailPanel]",
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
        }

        hlsRef.current.loadSource(effectiveUrl);
      } else if (target.canPlayType("application/vnd.apple.mpegurl")) {
        target.src = effectiveUrl;
        target.play().catch(() => {});
      }
    };

    attachHls(video);
  }, [effectiveUrl]); // effectiveUrl이 변경될 때만 함수 재생성

  // ✅ 컴포넌트 언마운트 시에만 HLS 정리
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

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
  const isWifiDetection = survivor.detectionMethod === 'wifi';

  // WiFi 탐지 상태 계산
  const getWifiStatus = (): 'detected' | 'recent' | 'none' | null => {
    if (!survivor.wifiSensorId) return null;

    const now = new Date();
    const TEN_MINUTES = 10 * 60 * 1000;

    // 현재 탐지 중인 경우
    if (survivor.currentSurvivorDetected === true) {
      return 'detected';
    }

    // 최근 10분 내 탐지 기록이 있는 경우
    if (survivor.lastSurvivorDetectedAt) {
      const lastDetectedTime = survivor.lastSurvivorDetectedAt instanceof Date
        ? survivor.lastSurvivorDetectedAt.getTime()
        : new Date(survivor.lastSurvivorDetectedAt).getTime();

      const timeDiff = now.getTime() - lastDetectedTime;

      if (timeDiff < TEN_MINUTES) {
        return 'recent';
      }
    }

    return 'none';
  };

  const wifiStatus = getWifiStatus();

  const riskColor =
    finalRisk >= 3.0
      ? "text-red-500"
      : finalRisk >= 1.0
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
           📌 CCTV 스트리밍 / WiFi 그래프
        ---------------------------------------------------- */}
        <section className="shrink-0">
          <label className="text-slate-300 flex items-center gap-2 mb-2">
            {isWifiDetection ? (
              <>
                <Wifi className="w-4 h-4" />
                실시간 WiFi CSI 데이터
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                실시간 CCTV
              </>
            )}
          </label>

          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full overflow-hidden relative aspect-video">
            {isWifiDetection && survivor.wifiSensorId ? (
              // ✅ 선택된 생존자의 센서 그래프만 표시
              <div className="absolute inset-0 w-full h-full">
                <WifiGraph sensorId={survivor.wifiSensorId} />
              </div>
            ) : effectiveUrl ? (
              <video
                ref={handleVideoRef}
                className="absolute inset-0 w-full h-full object-contain bg-black rounded"
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
                  <p className="text-xs opacity-50">
                    {survivor.lastDetection?.cctvId
                      ? `CCTV ${survivor.lastDetection.cctvId} - 스트림 로딩 중...`
                      : "Camera Feed Placeholder"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <Separator className="bg-slate-700" />

        {/* 실시간 감지 정보 */}
        <section className="shrink-0 bg-slate-800 rounded-lg p-3 text-sm space-y-2">
          <h3 className="text-slate-300 font-medium mb-2">📡 실시간 감지 정보</h3>

          {isWifiDetection ? (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">탐지 상태</span>
                {/* ✅ WiFi 실시간 데이터 우선 사용 */}
                {survivor.wifiRealtimeData?.survivor_detected === true ? (
                  <span className="text-red-400 font-semibold animate-pulse">
                    생존자 탐지
                  </span>
                ) : wifiStatus === 'recent' ? (
                  <span className="text-orange-400 font-semibold">
                    최근 10분 내 생존자 탐지
                  </span>
                ) : (
                  <span className="text-green-400">
                    생존자 미탐지
                  </span>
                )}
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">위치</span>
                <span className="text-white font-medium wrap-break-word">
                  {survivor.location} - {survivor.room}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">분석 시간</span>
                <span className="text-slate-300">
                  {/* ✅ WiFi 실시간 데이터의 timestamp 우선 표시 */}
                  {survivor.wifiRealtimeData?.timestamp
                    ? new Date(survivor.wifiRealtimeData.timestamp).toLocaleString()
                    : last?.detectedAt
                    ? new Date(last.detectedAt).toLocaleString()
                    : survivor.lastSurvivorDetectedAt
                    ? new Date(survivor.lastSurvivorDetectedAt).toLocaleString()
                    : "-"}
                </span>
              </div>

              {/* ✅ WiFi 실시간 CSI 데이터 표시 */}
              <div className="pt-2">
                <span className="text-slate-400">CSI 데이터</span>
                <p
                  className="text-slate-300 mt-1 text-xs font-mono max-h-20 overflow-auto bg-slate-900 p-2 rounded"
                  style={{
                    wordBreak: 'break-all',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {/* 실시간 데이터 우선, 없으면 lastDetection의 데이터 사용 */}
                  {survivor.wifiRealtimeData?.analysis_result ||
                   survivor.wifiRealtimeData?.csi_data ||
                   last?.aiAnalysisResult ||
                   "-"}
                </p>
              </div>
            </>
          ) : (
            <>
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
            </>
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
                {isWifiDetection ? (
                  /* ✅ WiFi 실시간 데이터 우선 사용 */
                  survivor.wifiRealtimeData?.survivor_detected === true ? (
                    <span className="text-red-400 font-semibold">생존자 탐지</span>
                  ) : wifiStatus === 'recent' ? (
                    <span className="text-orange-400 font-semibold">최근 10분 내 생존자 탐지</span>
                  ) : (
                    <span className="text-green-400">생존자 미탐지</span>
                  )
                ) : (
                  analysis?.aiAnalysisResult ?? "AI 분석 데이터를 불러오는 중..."
                )}
              </p>
            </div>

            {!isWifiDetection && (
              <>
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
              </>
            )}
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
          오탐(False Positive) 보고 / 구조 완료
        </Button>
      </div>
    </div>
  );
}
