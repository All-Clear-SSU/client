// src/components/PriorityList.tsx
import { Camera, Wifi, AlertTriangle, ChevronRight } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';
import type { Survivor, RecentSurvivorRecord } from '../lib/api';

interface PriorityListProps {
  survivors: Survivor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  recentRecords: RecentSurvivorRecord[];
  mode: 'realtime' | 'recent';
  onModeChange: (mode: 'realtime' | 'recent') => void;
  onDeleteRecent: (id: number) => void;
}

/** 🔥 상태 아이콘 (Survivor["status"] 전체 대응) */
const statusIcons: Record<Survivor["status"], string> = {
  conscious: '👤',
  unconscious: '🛌',
  injured: '🤕',
  trapped: '🚪',
  lying: '🛌',
  standing: '🚶',
  falling: '🛌',
  crawling: '🧎',
  sitting: '🪑🧍',
};

/** 🔥 상태 텍스트 (Survivor["status"] 전체 대응) */
const statusText: Record<Survivor["status"], string> = {
  conscious: '의식 있음',
  unconscious: '쓰러져 있음',
  injured: '부상',
  trapped: '갇힘',
  lying: '누워 있음',
  standing: '서 있음',
  falling: '쓰러져 있음',
  crawling: '기어가고 있음',
  sitting: '앉아 있음',
};

const statusColors = {
  pending: 'text-slate-400',
  dispatched: 'text-red-500',
  rescued: 'text-green-400'
};

const statusBadges = {
  pending: '대기',
  dispatched: '출동 중',
  rescued: '구조 완료'
};

const poseText: Record<string, string> = {
  CONSCIOUS: '의식 있음',
  UNCONSCIOUS: '의식 없음',
  INJURED: '부상',
  TRAPPED: '갇힘',
  LYING_DOWN: '누워 있음',
  STANDING: '서 있음',
  FALLING: '쓰러짐',
  CRAWLING: '기어감',
  SITTING: '앉아 있음',
};

export function PriorityList({ survivors, selectedId, onSelect, recentRecords, mode, onModeChange, onDeleteRecent }: PriorityListProps) {
  // ✅ WiFi 탐지 상태 판단 헬퍼 함수
  const getWifiDetectionStatus = (survivor: Survivor): 'detected' | 'recent' | 'none' | null => {
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

  const formatTime = (input?: string | null) => {
    if (!input) return '기록 없음';
    const d = new Date(input);
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  };

  return (
    <div className="h-full bg-slate-900 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              우선순위 리스트
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {mode === 'realtime' ? '위험도 기준 정렬' : '최근 48시간 타임아웃 기록'}
            </p>
          </div>
          {/* 좌측 패널 탭 전환: 실시간 / 최근 기록 */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onModeChange('realtime')}
              className={`px-3 py-1 rounded ${mode === 'realtime' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              실시간
            </button>
            <button
              onClick={() => onModeChange('recent')}
              className={`px-3 py-1 rounded ${mode === 'recent' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              최근 기록
            </button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {mode === 'realtime' ? (
          <div className="p-3 space-y-2">
            {survivors.map((survivor) => {
              const isSelected = selectedId === survivor.id;
              const isWifiDetection = survivor.detectionMethod === 'wifi';
              const wifiStatus = getWifiDetectionStatus(survivor);

              // ✅ WiFi 센서 생존자는 탐지 상태에 따라 처리
              let riskLevel: 'high' | 'medium' | 'low' = 'low';
              let riskColor = '';

              if (isWifiDetection) {
                if (wifiStatus === 'detected') {
                  // 생존자 탐지 중: 빨간색 + 애니메이션
                  riskLevel = 'high';
                  riskColor = 'border-red-500 bg-red-950/30 animate-pulse';
                } else if (wifiStatus === 'recent') {
                  // 최근 10분 내 탐지: 주황색
                  riskLevel = 'medium';
                  riskColor = 'border-orange-500 bg-orange-950/30';
                } else {
                  // 미탐지: 초록색
                  riskLevel = 'low';
                  riskColor = 'border-green-500 bg-green-950/30';
                }
              } else {
                // CCTV는 위험도 점수 기준
                riskLevel =
                  survivor.riskScore >= 3.0
                    ? 'high'
                    : survivor.riskScore >= 1.0
                      ? 'medium'
                      : 'low';
                riskColor =
                  riskLevel === 'high'
                    ? 'border-red-500 bg-red-950/30'
                    : riskLevel === 'medium'
                      ? 'border-orange-500 bg-orange-950/30'
                      : 'border-green-500 bg-green-950/30';
              }

              return (
                <button
                  key={survivor.id}
                  onClick={() => onSelect(survivor.id)}
                  className={`w-full p-3 rounded-lg border-l-4 ${riskColor}
                    ${isSelected ? 'bg-slate-800 ring-2 ring-blue-500' : 'bg-slate-800/50 hover:bg-slate-800'}
                    transition-all text-left relative overflow-hidden`}
                >
                  {/* WiFi 센서 생존자 특수 효과 (탐지 중일 때만) */}
                  {isWifiDetection && wifiStatus === 'detected' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-red-500/10 animate-pulse pointer-events-none" />
                  )}

                  <div className="flex items-start justify-between mb-2 relative z-10">
                    <div className="flex items-center gap-2">
                      {/* ✅ WiFi 생존자는 WiFi 아이콘, CCTV 생존자는 번호 표시 */}
                      {isWifiDetection ? (
                        <Wifi className={`w-5 h-5 ${
                          riskLevel === 'high'
                            ? 'text-red-500'
                            : riskLevel === 'medium'
                              ? 'text-orange-500'
                              : 'text-green-500'
                        } ${wifiStatus === 'detected' ? 'animate-pulse' : ''}`} />
                      ) : (
                        <span className="text-white">{survivor.rank}.</span>
                      )}
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          riskLevel === 'high'
                            ? 'text-red-500'
                            : riskLevel === 'medium'
                              ? 'text-orange-500'
                              : 'text-green-500'
                        } ${isWifiDetection && wifiStatus === 'detected' ? 'animate-pulse' : ''}`}
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
                        <span className="text-white">{survivor.riskScore.toFixed(1)}점</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>

                  <div className="space-y-1">
                    <div className="text-slate-300 text-sm">
                      📍 {survivor.room}
                    </div>

                    {/* WiFi 생존자가 아닌 경우에만 자세 정보 표시 */}
                    {!isWifiDetection && (
                      <div className="flex items-center gap-2">
                        <span>{statusIcons[survivor.status]}</span>
                        <span className="text-slate-400 text-sm">
                          {statusText[survivor.status]}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {survivor.detectionMethod === 'cctv' ? (
                          <Camera className="w-3 h-3 text-slate-400" />
                        ) : (
                          <Wifi className="w-3 h-3 text-slate-400" />
                        )}
                        <span className="text-slate-500 text-xs uppercase">
                          {survivor.detectionMethod}
                        </span>
                      </div>

                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[survivor.rescueStatus]} border-current`}
                      >
                        {statusBadges[survivor.rescueStatus]}
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {recentRecords.length === 0 && (
              <div className="text-slate-400 text-sm bg-slate-800/50 rounded-lg p-4">
                최근 48시간 내 타임아웃된 기록이 없습니다.
              </div>
            )}
            {recentRecords.map((record) => (
              <div
                key={record.id}
                className="w-full p-3 rounded-lg border-l-4 border-blue-500 bg-slate-800/60"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {record.detectionMethod === 'CCTV' ? (
                      <Camera className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Wifi className="w-4 h-4 text-blue-400" />
                    )}
                    <span className="text-white font-semibold">
                      #{record.survivorNumber}
                    </span>
                    <Badge variant="outline" className="text-xs text-blue-200 border-blue-400/60">
                      최근 기록
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">{formatTime(record.lastDetectedAt)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-300 hover:text-white hover:bg-red-700/60"
                      onClick={() => onDeleteRecent(record.id)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      삭제
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-slate-300">
                    📍 {record.fullAddress || record.roomNumber || record.buildingName || '위치 정보 없음'}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>자세:</span>
                    <span className="text-white">
                      {record.lastPose ? (poseText[record.lastPose] || record.lastPose) : '정보 없음'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>위험도:</span>
                    <span className="text-white">{record.lastRiskScore ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>카메라 ID:</span>
                    <span className="text-white">{record.cctvId ?? '없음'}</span>
                  </div>
                  {(record.aiSummary || record.aiAnalysisResult) && (
                    <div className="text-slate-400">
                      <span className="text-xs text-slate-500">AI 분석:</span>
                      <div className="text-white text-xs max-h-12 overflow-hidden text-ellipsis">
                        {record.aiSummary || record.aiAnalysisResult}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
