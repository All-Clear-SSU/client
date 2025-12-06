// src/lib/liveStreamApi.ts
const BASE_URL = "http://16.184.55.244:8080"; // 기존에 쓰던 거랑 맞춰서

// 1) 라이브 스트리밍 시작
export async function startLiveStream(
  cctvId: number,
  locationId: number,
  confThreshold = 0.5,
  poseConfThreshold = 0.5
): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/live-stream/start`, {
    // 스웨거에 /api/live-stream/start 로 되어 있으면 여기만 /api/live-stream/start 로 바꾸면 됨
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      cctvId,
      locationId,
      confThreshold,
      poseConfThreshold,
    }),
  });

  if (!res.ok) {
    console.error("[LIVE] startLiveStream 실패:", res.status);
    return null;
  }

  const body = await res.json();
  console.log("[LIVE] startLiveStream 응답:", body);

  if (body.status !== "success" || !body.hlsUrl) {
    console.error("[LIVE] hlsUrl 없음 또는 status != success");
    return null;
  }

  return body.hlsUrl as string;
}

// 2) 현재 라이브 스트림 URL만 조회 (이미 시작된 경우)
export async function getLiveStreamUrl(
  cctvId: number
): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/live-stream/url/${cctvId}`, {
    method: "GET",
  });

  if (!res.ok) {
    console.error("[LIVE] getLiveStreamUrl 실패:", res.status);
    return null;
  }

  const text = await res.text();
  // 이 API는 JSON이 아니라 text/plain 으로 m3u8 URL만 내려준다고 했음
  const trimmed = text.trim();
  console.log("[LIVE] getLiveStreamUrl 응답:", trimmed);

  if (!trimmed.startsWith("http")) return null;
  return trimmed;
}