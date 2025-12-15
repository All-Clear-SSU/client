// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BuildingProvider } from "./context/BuildingContext";

import LandingPage from "./pages/LandingPage";
import BuildingSetupPage from "./pages/BuildingSetupPage";
import BuildingSelectPage from "./pages/BuildingSelectPage";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <BuildingProvider>
      <BrowserRouter>
        <Routes>
          {/* 0️⃣ 최초 진입: 서비스 랜딩 */}
          <Route path="/" element={<LandingPage />} />

          {/* 1️⃣ 건물 / CCTV / CSI 등록 */}
          <Route path="/setup" element={<BuildingSetupPage />} />

          {/* 2️⃣ 등록된 건물 선택 */}
          <Route path="/select" element={<BuildingSelectPage />} />

          {/* 3️⃣ 메인 대시보드 */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ❌ 잘못된 경로 접근 시 랜딩으로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </BuildingProvider>
  );
}