import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBuilding } from "../context/BuildingContext";

const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#020617",
    color: "white",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
};

const cardStyle: React.CSSProperties = {
    width: "min(520px, 92vw)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 18,
};

const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 8,
};

const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "2px solid rgba(255,255,255,0.35)",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    outline: "none",
};

const primaryBtnStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
};

export default function BuildingSelectPage() {
    const navigate = useNavigate();
    const { buildings, setSelectedBuilding } = useBuilding();

    const [selectedId, setSelectedId] = useState<string>("");

    /* ===================== ✅ API 연동 추가 ===================== */
    useEffect(() => {
        const fetchBuildings = async () => {
            try {
                const res = await fetch("/buildings");
                if (!res.ok) throw new Error("건물 목록 조회 실패");

                const names: string[] = await res.json();

                // ⚠️ 서버에서 내려준 이름 기준으로
                // Context에 있는 building과 매칭 (UI/Context 변경 없음)
                if (names.length > 0 && buildings.length > 0) {
                    const matched = buildings.find((b) => names.includes(b.name));
                    if (matched) {
                        setSelectedId(matched.id);
                    }
                }
            } catch (e) {
                console.error("건물 목록 API 오류:", e);
            }
        };

        fetchBuildings();
    }, [buildings]);
    /* ============================================================ */

    const selected = useMemo(
        () => buildings.find((b) => b.id === selectedId) ?? null,
        [buildings, selectedId]
    );

    const goDashboard = () => {
        if (!selected) return;
        setSelectedBuilding(selected);
        navigate("/dashboard");
    };

    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>
                    건물 선택
                </div>

                <div style={labelStyle}>등록된 건물 목록</div>
                <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    style={selectStyle}
                >
                    <option value="">건물을 선택하세요</option>
                    {buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name}
                        </option>
                    ))}
                </select>

                <div
                    style={{
                        marginTop: 12,
                        fontSize: 13,
                        color: "rgba(255,255,255,0.70)",
                    }}
                >
                    {selected
                        ? `선택됨: CCTV ${selected.cctvs.length}개 / CSI ${selected.csis.length}개`
                        : "건물을 선택하면 정보가 표시됩니다."}
                </div>

                <button
                    onClick={goDashboard}
                    disabled={!selected}
                    style={{
                        ...primaryBtnStyle,
                        marginTop: 14,
                        opacity: selected ? 1 : 0.45,
                        cursor: selected ? "pointer" : "not-allowed",
                    }}
                >
                    대시보드로 이동
                </button>
            </div>
        </div>
    );
}