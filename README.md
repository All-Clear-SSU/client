# 🚨 All-Clear Client (Frontend)

재난 상황에서 **실시간 CCTV, AI 분석, 구조 우선순위 시각화**를 제공하는  
**All-Clear 재난 대응 시스템 프론트엔드**입니다.

---

## ✅ 주요 기능

- ✅ 실시간 CCTV 멀티뷰 (HLS 스트리밍)
- ✅ 생존자 우선순위 자동 정렬
- ✅ AI 기반 자세/위험도 분석 결과 시각화
- ✅ 생존자 상세 패널 (CCTV + AI 리포트)
- ✅ 오탐(False Positive) 신고
- ✅ 구조팀 출동 요청
- ✅ Netlify 정적 배포

---

## 🛠️ 기술 스택

- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **UI**: Tailwind CSS
- **Video Streaming**: HLS.js
- **Deployment**: Netlify
- **API**: Spring Boot REST API

---

## 📦 설치 및 실행

### 1️⃣ 사전 요구사항 체크

프론트엔드 실행 전에 아래 조건이 충족되어야 합니다.

- **Node.js 20 이상** 설치 권장
- 백엔드 서버가 **로컬에서 실행 중**이어야 함
- 백엔드 CORS 설정에 **프론트 포트(기본 3000)** 이 허용되어 있어야 함

---

### 2️⃣ 코드 클론 및 프로젝트 이동

터미널 또는 PowerShell을 열고 원하는 경로로 이동한 뒤  
아래 명령어를 실행하여 레포지토리를 클론합니다.

```bash
git clone https://github.com/All-Clear-SSU/client all-clear-client
