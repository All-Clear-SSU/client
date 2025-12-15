
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBuilding } from "../context/BuildingContext";
import type { BuildingConfig } from "../context/BuildingContext";

type CCTV = { location: string; streamUrl: string };
type CSI = { location: string; topic: string };

function makeId(): string {
  // TS에서 crypto.randomUUID 타입/환경 이슈를 피하기 위해 안전한 fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyBuilding(): BuildingConfig {
  return {
    id: makeId(),
    name: "",
    cctvs: [],
    csis: [],
  };
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#020617",
  color: "white",
  padding: 24,
  position: "relative",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 16,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.10)",
  color: "white",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#2563eb",
  border: "none",
};

const smallLabel: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.75)",
  marginBottom: 6,
};

export default function BuildingSetupPage() {
  const navigate = useNavigate();
  const { buildings, setBuildings } = useBuilding();

  // 등록용: 현재 작성 중인 건물
  const [current, setCurrent] = useState<BuildingConfig>(() => emptyBuilding());

  // 드롭다운: 기존 건물 선택(보기용)
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedId) ?? null,
    [buildings, selectedId]
  );

  const hasAtLeastOneDevice = current.cctvs.length + current.csis.length >= 1;
  const canRegister = current.name.trim().length > 0 && hasAtLeastOneDevice;

  /* -------------------- CURRENT: CCTV/CSI 추가 -------------------- */
  const addCCTV = () => {
    setCurrent((prev) => ({
      ...prev,
      cctvs: [...prev.cctvs, { location: "", streamUrl: "" }],
    }));
  };

  const addCSI = () => {
    setCurrent((prev) => ({
      ...prev,
      csis: [...prev.csis, { location: "", topic: "" }],
    }));
  };

  /* -------------------- CURRENT: CCTV/CSI 수정 -------------------- */
  const updateCCTV = (idx: number, patch: Partial<CCTV>) => {
    setCurrent((prev) => {
      const next = prev.cctvs.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      return { ...prev, cctvs: next };
    });
  };

  const updateCSI = (idx: number, patch: Partial<CSI>) => {
    setCurrent((prev) => {
      const next = prev.csis.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      return { ...prev, csis: next };
    });
  };

  const removeCCTV = (idx: number) => {
    setCurrent((prev) => ({
      ...prev,
      cctvs: prev.cctvs.filter((_, i) => i !== idx),
    }));
  };

  const removeCSI = (idx: number) => {
    setCurrent((prev) => ({
      ...prev,
      csis: prev.csis.filter((_, i) => i !== idx),
    }));
  };

  /* -------------------- 등록(건물 확정) -------------------- */
  const registerBuilding = () => {
    if (!canRegister) return;

    setBuildings((prev) => [...prev, current]);

    // 다음 건물 입력으로 초기화
    setCurrent(emptyBuilding());
  };

  /* -------------------- 최종 완료 -------------------- */
  const finishAll = () => {
    if (buildings.length < 1) return;
    navigate("/select");
  };

  return (
    <div style={pageStyle}>
      {/* 우측 상단: 등록 완료 */}
      <button
        onClick={finishAll}
        disabled={buildings.length < 1}
        style={{
          ...primaryBtnStyle,
          position: "absolute",
          top: 18,
          right: 18,
          opacity: buildings.length < 1 ? 0.45 : 1,
          cursor: buildings.length < 1 ? "not-allowed" : "pointer",
        }}
      >
        등록 완료
      </button>

      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>건물 등록</h2>

        {/* 드롭다운(기등록 건물 보기) */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={smallLabel}>등록된 건물 목록</div>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: "auto",
                }}
              >
                <option value="">(선택)</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <div style={smallLabel}>선택된 건물 정보(보기)</div>
              <div
                style={{
                  ...inputStyle,
                  display: "flex",
                  alignItems: "center",
                  minHeight: 42,
                  opacity: selectedBuilding ? 1 : 0.65,
                }}
              >
                {selectedBuilding
                  ? `CCTV ${selectedBuilding.cctvs.length}개 / CSI ${selectedBuilding.csis.length}개`
                  : "건물을 선택하면 개수가 표시됩니다."}
              </div>
            </div>
          </div>
        </div>

        {/* 현재 건물 입력 */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={smallLabel}>건물 이름</div>
              <input
                value={current.name}
                onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예) 형남공학관"
                style={inputStyle}
              />
            </div>

            {/* CCTV 섹션 */}
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>CCTV</div>
                <button onClick={addCCTV} style={buttonStyle}>
                  + CCTV 추가
                </button>
              </div>

              {current.cctvs.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                  아직 CCTV가 없습니다. “+ CCTV 추가”를 눌러 추가하세요.
                </div>
              ) : (
                current.cctvs.map((c, i) => (
                  <div
                    key={`cctv-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      background: "rgba(0,0,0,0.18)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <input
                      value={c.location}
                      onChange={(e) => updateCCTV(i, { location: e.target.value })}
                      placeholder="CCTV 위치 입력"
                      style={inputStyle}
                    />
                    <input
                      value={c.streamUrl}
                      onChange={(e) => updateCCTV(i, { streamUrl: e.target.value })}
                      placeholder="CCTV 스트림 URL 입력"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => removeCCTV(i)}
                      style={{ ...buttonStyle, opacity: 0.9 }}
                      title="삭제"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* CSI 섹션 */}
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>CSI</div>
                <button onClick={addCSI} style={buttonStyle}>
                  + CSI 추가
                </button>
              </div>

              {current.csis.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                  아직 CSI가 없습니다. “+ CSI 추가”를 눌러 추가하세요.
                </div>
              ) : (
                current.csis.map((c, i) => (
                  <div
                    key={`csi-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      background: "rgba(0,0,0,0.18)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <input
                      value={c.location}
                      onChange={(e) => updateCSI(i, { location: e.target.value })}
                      placeholder="CSI 모듈 위치 입력"
                      style={inputStyle}
                    />
                    <input
                      value={c.topic}
                      onChange={(e) => updateCSI(i, { topic: e.target.value })}
                      placeholder="CSI TOPIC 입력"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => removeCSI(i)}
                      style={{ ...buttonStyle, opacity: 0.9 }}
                      title="삭제"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* 등록하기: CCTV/CSI 최소 1개 + 건물명 있어야 표시 */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              {canRegister ? (
                <button onClick={registerBuilding} style={primaryBtnStyle}>
                  등록 하기
                </button>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                  ※ 건물 이름 입력 + CCTV 또는 CSI를 최소 1개 추가하면 “등록 하기”가 나타납니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 안내 */}
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          • “등록 하기”는 현재 입력 중인 건물만 목록에 추가합니다. <br />
          • 모든 건물 등록이 끝나면 우측 상단 “등록 완료”로 다음 페이지로 이동합니다.
        </div>
      </div>
    </div>
  );
}