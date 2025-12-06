// ===============================
//  API BASE URL
// ===============================

export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

if (!API_BASE) {
  console.warn("⚠️ VITE_API_BASE가 설정되지 않음. 기본값 /api 사용");
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
    | "STANDING";
  detectionMethod: "WIFI" | "CCTV";
  rescueStatus: "WAITING" | "IN_RESCUE" | "RESCUED" | "CANCELED";
};

/** Detection(자세, 신뢰도 등) 타입 */
export type Detection = {
  id: number;
  survivorId: number;
  detectedAt: string;
  detectedStatus: string;
  aiAnalysisResult: string;
  aiModelVersion: string;
  confidence: number;
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
    | "standing";

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
};

// ===============================
//  매핑 테이블
// ===============================

const mapStatus = {
  CONSCIOUS: "conscious",
  UNCONSCIOUS: "unconscious",
  INJURED: "injured",
  TRAPPED: "trapped",
  LYING_DOWN: "lying",
  STANDING: "standing",
} as const;

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

function estimateRiskScore(): number {
  return 10;
}

// ===============================
//  Survivor Fetch
// ===============================

/** 🔥 생존자 목록 가져오기 */
export async function fetchSurvivors(): Promise<Survivor[]> {
  const res = await fetch(`${API_BASE}/survivors`);
  if (!res.ok) throw new Error("서버에서 생존자 목록을 가져올 수 없습니다.");

  const arr: ApiSurvivor[] = await res.json();

  return arr.map((a, i) => ({
    id: String(a.id),
    rank: 0,
    riskScore: estimateRiskScore(),

    location: a.location?.buildingName ?? "Unknown",
    floor: a.location?.floor ?? 0,
    room: a.location?.fullAddress ?? a.location?.roomNumber ?? "-",

    status: mapStatus[a.currentStatus],
    detectionMethod: mapMethod[a.detectionMethod],
    rescueStatus: mapRescue[a.rescueStatus],

    x: 50 + ((i * 7) % 40),
    y: 50 + ((i * 11) % 40),

    lastDetection: null,
    videoUrl: null,
    hlsUrl: null,
    poseLabel: null,
    poseConfidence: null,

    /** 🔥 백엔드에서 survivor.wifiSensorId 주면 자동으로 반영됨 */
    wifiSensorId: null,
  }));
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

export async function deleteSurvivor(id: string) {
  const res = await fetch(`${API_BASE}/survivors/${id}`, { method: "DELETE" });
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
  const res = await fetch(`${API_BASE}/detections/survivor/${survivorId}/analysis`);
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
//  HLS 스트림 URL 가져오기
// ===============================

export async function fetchStreamUrl(
  cctvId: number
): Promise<{ streamUrl: string }> {
  const res = await fetch(`${API_BASE}/cctvs/streams/${cctvId}`);
  if (!res.ok) throw new Error("스트림 URL을 가져오지 못했습니다.");
  return await res.json();
}