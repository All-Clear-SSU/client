// ===============================
//  API BASE URL
// ===============================

// 🔥 기존 코드 (주석처리)
// export const API_BASE = import.meta.env.VITE_API_BASE || "/api";
// if (!API_BASE) {
//   console.warn("⚠️ VITE_API_BASE가 설정되지 않음. 기본값 /api 사용");
// }

// ✅ 수정된 코드: 환경 변수로 백엔드 서버 URL 관리
// - 로컬: http://localhost:8080 (vite dev 서버에서 직접 백엔드 호출)
// - 배포(기본): /api → Netlify `_redirects`로 백엔드 프록시
const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
const defaultApiBase = isLocalHost ? "http://localhost:8080" : "/api";

export const API_BASE = import.meta.env.VITE_API_BASE || defaultApiBase;

if (!import.meta.env.VITE_API_BASE) {
  console.warn(`⚠️ VITE_API_BASE가 설정되지 않음. 기본값 ${defaultApiBase} 사용`);
}

// ===============================
//  백엔드 기본 타입들
// ===============================

/** 스프링 Survivor 원본 타입 */
export type ApiSurvivor = {
  id: number;
  survivorNumber: number;
  location: {
    id?: number;
    buildingName: string;
    floor: number;
    roomNumber: string;
    fullAddress?: string;
  };
  currentStatus:
    | "CONSCIOUS"
    | "UNCONSCIOUS"
    | "INJURED"
    | "TRAPPED"
    | "LYING_DOWN"
    | "STANDING"
    | "FALLING"
    | "CRAWLING"
    | "SITTING";
  detectionMethod: "WIFI" | "CCTV";
  rescueStatus: "WAITING" | "IN_RESCUE" | "RESCUED" | "CANCELED";
};

/** Detection(자세, 신뢰도 등) 타입 */
export type Detection = {
  id: number;
  survivorId: number;
  detectionType?: "CCTV" | "WIFI"; // ✅ Detection 유형
  cctvId?: number | null; // ✅ CCTV ID
  wifiSensorId?: number | null; // ✅ WiFi Sensor ID 추가
  detectedAt: string;
  detectedStatus: string;
  aiAnalysisResult: string;
  aiModelVersion: string;
  confidence: number | null; // CCTV 전용 (WiFi는 null)
  imageUrl: string | null;
  videoUrl: string | null; // HLS 스트림 URL
  rawData?: string;
};

/** PriorityAssessment 위험도 정보 */
export type PriorityAssessment = {
  id: number;
  survivorId: number;
  finalRiskScore: number;
  statusScore: number;
  environmentScore: number;
  confidenceCoefficient: number;
  assessedAt: string;
};

// ===============================
//  프론트 UI용 Survivor 타입
// ===============================

export type Survivor = {
  id: string;
  rank: number;
  riskScore: number;

  location: string;
  floor: number;
  room: string;

  status:
    | "conscious"
    | "unconscious"
    | "injured"
    | "trapped"
    | "lying"
    | "standing"
    | "falling"
    | "crawling"
    | "sitting";

  detectionMethod: "wifi" | "cctv";
  rescueStatus: "pending" | "dispatched" | "rescued";

  x: number;
  y: number;

  /** 🔥 WebSocket 실시간 업데이트 */
  lastDetection?: Detection | null;

  /** 🔥 실시간 영상 URL */
  videoUrl?: string | null;

  /** 🔥 HLS URL (CCTV 스트림 URL) */
  hlsUrl?: string | null;

  /** 🔥 실시간 Pose 정보 */
  poseLabel?: string | null;
  poseConfidence?: number | null;

  /** 🔥 WiFi 센서 ID (그래프 표시용) */
  wifiSensorId?: string | null;  // ★ 추가된 부분

  /** 🔥 WiFi 센서 - 현재 생존자 탐지 여부 (실시간 WebSocket으로 업데이트) */
  currentSurvivorDetected?: boolean | null;

  /** 🔥 WiFi 센서 - 마지막 생존자 탐지 시간 */
  lastSurvivorDetectedAt?: Date | null;

  /** 🔥 WiFi 센서 - 실시간 데이터 (WebSocket으로 업데이트) */
  wifiRealtimeData?: {
    timestamp?: string;
    csi_data?: string | number[] | null;
    analysis_result?: string;
    detected_status?: string;
    survivor_detected?: boolean;
  } | null;

  /** 🔥 CCTV - 마지막 탐지 시간 (타임아웃 기반 자동 제거용) */
  lastCctvDetectedAt?: Date | null;
};

// ===============================
//  매핑 테이블
// ===============================

const mapStatus: Record<ApiSurvivor["currentStatus"], Survivor["status"]> = {
  CONSCIOUS: "conscious",
  UNCONSCIOUS: "unconscious",
  INJURED: "injured",
  TRAPPED: "trapped",
  LYING_DOWN: "lying",
  STANDING: "standing",
  FALLING: "falling",
  CRAWLING: "crawling",
  SITTING: "sitting",
};

const mapMethod = {
  CCTV: "cctv",
  WIFI: "wifi",
} as const;

const mapRescue = {
  WAITING: "pending",
  IN_RESCUE: "dispatched",
  RESCUED: "rescued",
  CANCELED: "pending",
} as const;

// ✅ 초기 점수를 0으로 설정 (WebSocket으로 실제 점수 업데이트 대기)
function estimateRiskScore(): number {
  return 0;
}

// ===============================
//  Survivor Fetch
// ===============================

/** 🔥 생존자 목록 가져오기 */
export async function fetchSurvivors(): Promise<Survivor[]> {
  const res = await fetch(`${API_BASE}/survivors`);
  if (!res.ok) throw new Error("서버에서 생존자 목록을 가져올 수 없습니다.");

  const arr: ApiSurvivor[] = await res.json();

  // ✅ 각 생존자의 최신 위험도 점수를 병렬로 가져오기
  const survivorsWithScores = await Promise.all(
    arr.map(async (a, i) => {
      let riskScore = estimateRiskScore(); // 기본값 0
      let lastDetection: Detection | null = null;

      // ✅ CCTV로 감지된 생존자만 위험도 점수 가져오기 (WiFi 센서 생존자는 점수 불필요)
      if (a.detectionMethod === "CCTV") {
        try {
          const priorityData = await fetchLatestPriority(String(a.id));
          riskScore = priorityData.finalRiskScore ?? 0;
        } catch (err) {
          // 위험도 점수가 없는 경우 0으로 유지
          console.warn(`생존자 ${a.id}의 위험도 점수를 가져올 수 없습니다.`, err);
        }
      }

      // ✅ 최신 Detection 정보 가져오기 (cctvId 포함)
      try {
        lastDetection = await fetchLatestDetection(String(a.id));
      } catch (err) {
        // Detection 정보가 없는 경우 null 유지
        console.warn(`생존자 ${a.id}의 Detection 정보를 가져올 수 없습니다.`, err);
      }

      return {
        id: String(a.id),
        rank: 0,
        riskScore,

        location: a.location?.buildingName ?? "Unknown",
        floor: a.location?.floor ?? 0,
        room: a.location?.fullAddress ?? a.location?.roomNumber ?? "-",

        status: mapStatus[a.currentStatus] ?? "standing",
        detectionMethod: mapMethod[a.detectionMethod],
        rescueStatus: mapRescue[a.rescueStatus],

        x: 50 + ((i * 7) % 40),
        y: 50 + ((i * 11) % 40),

        lastDetection, // ✅ 최신 Detection 정보 설정
        videoUrl: lastDetection?.videoUrl ?? null,
        hlsUrl: null,
        poseLabel: lastDetection?.detectedStatus ?? null,
        poseConfidence: lastDetection?.confidence ?? null,

        /** ✅ WiFi 센서 ID 설정 (WiFi Detection인 경우) */
        wifiSensorId: lastDetection?.wifiSensorId ? String(lastDetection.wifiSensorId) : null,

        /** ✅ CCTV 생존자의 경우 초기 탐지 시간 설정 (타임아웃 체크용) */
        lastCctvDetectedAt: a.detectionMethod === "CCTV" ? new Date() : null,
      };
    })
  );

  return survivorsWithScores;
}

// ===============================
//  구조 상태 변경
// ===============================

export async function updateRescueStatus(
  id: string,
  status: "WAITING" | "IN_RESCUE" | "RESCUED" | "CANCELED"
) {
  const res = await fetch(
    `${API_BASE}/survivors/${id}/rescue-status?rescueStatus=${status}`,
    { method: "PATCH" }
  );
  if (!res.ok) throw new Error("구조 상태 변경 실패");
}

// ===============================
//  오탐 제거
// ===============================

export type DeleteReason = "TIMEOUT" | "MANUAL";

export async function deleteSurvivor(id: string, reason: DeleteReason = "MANUAL") {
  const res = await fetch(`${API_BASE}/survivors/${id}?reason=${reason}`, { method: "DELETE" });
  if (!res.ok) throw new Error("오탐 제거 실패");
}

// ===============================
//  AI 분석 정보 가져오기
// ===============================

export type AiAnalysis = {
  survivorId: number;
  survivorNumber: number;
  aiAnalysisResult: string;
  locationId: number;
  fullAddress: string;
  currentStatus: string;
  currentStatusDescription: string;
  detectionMethod: string;
  detectionMethodDescription: string;
  statusScore: number;
  environmentScore: number;
  confidenceCoefficient: number;
  finalRiskScore: number;
};

export async function fetchAiAnalysis(survivorId: string): Promise<AiAnalysis> {
  // ✅ 캐시 무효화를 위한 타임스탬프 추가
  const timestamp = new Date().getTime();
  const res = await fetch(`${API_BASE}/detections/survivor/${survivorId}/analysis?_t=${timestamp}`, {
    cache: 'no-store', // 브라우저 캐시를 사용하지 않도록 설정
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  if (!res.ok) throw new Error("AI 분석 정보를 가져오지 못했습니다.");
  return await res.json();
}

// ===============================
//  최신 Priority Score 가져오기
// ===============================

export async function fetchLatestPriority(survivorId: string) {
  const res = await fetch(`${API_BASE}/survivors/${survivorId}/priority-score-latest`);
  if (!res.ok) throw new Error("최신 위험도 점수 가져오기 실패");
  return await res.json();
}

// ===============================
//  최신 Detection 가져오기
// ===============================

export async function fetchLatestDetection(survivorId: string): Promise<Detection | null> {
  try {
    const res = await fetch(`${API_BASE}/detections/survivor/${survivorId}/latest`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ===============================
//  HLS 스트림 URL 가져오기
// ===============================

export async function fetchStreamUrl(
  cctvId: number
): Promise<{ streamUrl: string }> {
  const res = await fetch(`${API_BASE}/cctvs/streams/${cctvId}`);
  if (!res.ok) throw new Error("스트림 URL을 가져오지 못했습니다.");
  return await res.json();
}

// ===============================
//  WiFi 센서 정보 가져오기
// ===============================

export type WifiSensor = {
  id: number;
  sensorCode: string;
  location: {
    id: number;
    buildingName: string;
    floor: number;
    roomNumber: string;
    fullAddress: string;
  };
  isActive: boolean;
  lastActiveAt: string | null;
};

export async function fetchWifiSensor(sensorId: number): Promise<WifiSensor | null> {
  try {
    const res = await fetch(`${API_BASE}/wifi-sensors`);
    if (!res.ok) return null;
    const sensors: WifiSensor[] = await res.json();
    return sensors.find(s => s.id === sensorId) || null;
  } catch {
    return null;
  }
}

// ===============================
//  CCTV 정보 가져오기
// ===============================

export type CctvInfo = {
  id: number;
  cctvCode: string;
  location: {
    id: number;
    buildingName: string;
    floor: number;
    roomNumber: string;
    fullAddress: string;
  };
  isActive: boolean;
  lastActiveAt: string | null;
};

export async function fetchCctvInfo(cctvId: number): Promise<CctvInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/cctvs/${cctvId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAllCctvs(): Promise<CctvInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/cctvs`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ===============================
//  최근 생존자 기록 (타임아웃 스냅샷)
// ===============================

export type RecentSurvivorRecord = {
  id: number;
  survivorId: number;
  survivorNumber: number;
  buildingName?: string | null;
  floor?: number | null;
  roomNumber?: string | null;
  fullAddress?: string | null;
  lastDetectedAt?: string | null;
  lastPose?: ApiSurvivor["currentStatus"] | null;
  lastRiskScore?: number | null;
  detectionMethod?: "WIFI" | "CCTV" | null;
  cctvId?: number | null;
  wifiSensorId?: number | null;
  aiAnalysisResult?: string | null;
  aiSummary?: string | null;
  archivedAt: string;
};

export type RecentRecordEvent = {
  type: "added" | "deleted";
  record?: RecentSurvivorRecord | null;
  recordId?: number | null;
};

export async function fetchRecentSurvivors(hours = 48): Promise<RecentSurvivorRecord[]> {
  const res = await fetch(`${API_BASE}/recent-survivors?hours=${hours}`);
  if (!res.ok) throw new Error("최근 생존자 기록을 가져오지 못했습니다.");
  return await res.json();
}

export async function deleteRecentSurvivor(id: number) {
  const res = await fetch(`${API_BASE}/recent-survivors/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("최근 기록 삭제 실패");
}
