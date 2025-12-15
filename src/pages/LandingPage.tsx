import { useNavigate } from "react-router-dom";

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#020617", // slate-950 느낌
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
      }}
    >
      {/* 프로젝트 이름 */}
      <h1
        style={{
          fontSize: "64px",
          fontWeight: "800",
          letterSpacing: "-1px",
          marginBottom: "5px",
        }}
      >
        All-Clear
      </h1>

      {/* 설명 문구 */}
      <div
        style={{
          fontSize: "20px",
          color: "rgba(255,255,255,0.75)",
          marginBottom: "44px",
          textAlign: "center",
          lineHeight: 1.0,
        }}
      >
        <span style={{ color: "#ef4444", fontWeight: 700 }}>
          화재 상황
        </span>
        에서 사각지대 없는{" "}
        <span style={{ color: "#3b82f6", fontWeight: 700 }}>
          생존자 우선순위 리스트
        </span>{" "}
        확보 서비스
      </div>

      {/* 버튼 */}
      <button
        onClick={() => navigate("/setup")}   // ✅ 여기만 변경
        style={{
          padding: "16px 36px",
          fontSize: "18px",
          fontWeight: "600",
          borderRadius: "12px",
          backgroundColor: "#2563eb", // blue-600
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        건물별 CCTV 등록하기
      </button>
    </div>
  );
};

export default LandingPage;