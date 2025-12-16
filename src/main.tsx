import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import "./index.css"; // Tailwind가 포함된 메인 CSS
import App from "./App.tsx";
import { BuildingProvider } from "./context/BuildingContext";
import BuildingSelectPage from "./pages/BuildingSelectPage";
import BuildingSetupPage from "./pages/BuildingSetupPage";
import LandingPage from "./pages/LandingPage";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <BuildingProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup" element={<BuildingSetupPage />} />
        <Route path="/select" element={<BuildingSelectPage />} />
        <Route path="/dashboard" element={<App />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BuildingProvider>
  </BrowserRouter>
);
