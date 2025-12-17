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

## 📦 설치 및 실행 (Installation & Setup)

### Step 1: 사전 요구사항 체크
- **Node.js**: 20+ 버전 (권장)
- **Backend Setup**: 백엔드 서버가 로컬에서 실행 중이어야 합니다.
- **CORS Config**: 백엔드 CORS 설정에 프론트엔드 포트(기본 `3000`)가 허용되어 있어야 합니다.

### Step 2: 코드 받기 (Clone)
터미널 또는 Powershell을 열고 프로젝트를 클론한 뒤 해당 디렉토리로 이동합니다.

```bash
# Repository 클론
git clone https://github.com/All-Clear-SSU/client all-clear-client

# 프로젝트 루트 폴더로 이동
cd all-clear-client
```

프로젝트 디렉터리 구조 확인하기
```text
client/
├─ src/                 # React/Vite 소스
│  ├─ assets/           # 정적 리소스
│  ├─ components/       # UI 컴포넌트
│  ├─ lib/              # 공용 로직 (api.ts, socket.ts 등)
│  ├─ pages/            # 라우트 페이지
│  └─ styles/           # 전역 스타일 (존재 시)
├─ public/              # 공개 정적 파일
├─ package.json         # 스크립트 / 의존성
├─ vite.config.ts       # Vite 설정
├─ tsconfig*.json       # TypeScript 설정
├─ tailwind.config.js   # Tailwind 설정
├─ netlify.toml         # 배포 / 프록시 설정 (사용 시)
└─ README.md            # 프로젝트 문서

### Step 3: 환경 변수 설정 및 의존성 설치
프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 입력하여 환경변수를 주입합니다.

**📄 .env.local**
```env
VITE_API_BASE=http://localhost:8080   # REST API 호출
VITE_WS_URL=http://localhost:8080/ws  # STOMP/SockJS WebSocket
```

의존성 패키지를 설치합니다.
```bash
npm install
```

### Step 4: 프론트 서버 실행
개발 모드로 서버를 실행합니다.

```bash
npm run dev -- --host --port 3000
```

- **접속 주소**: [http://localhost:3000](http://localhost:3000)
- **Note**: 백엔드 서버가 켜져 있어야 API와 WebSocket 연결이 성공합니다.

### Step 5: 백엔드 서버와 연동 확인

#### 1. WebSocket 연결 확인
- 프론트 페이지가 열린 상태에서 `F12`를 눌러 개발자 도구를 엽니다.
- **Console** 탭에서 다음 메시지가 뜨면 연결 성공입니다.
  > `[STOMP] Opening Web Socket…` → `[STOMP] connected`

#### 2. HLS / 스트림 연결 확인
**터미널에서 확인 (curl)**
```bash
curl -I http://localhost:8080/streams/cctv1/playlist.m3u8
```
> `200 OK` 응답이 반환되면 연결 성공입니다.

**실제 라이브 스트리밍 확인**
1. Swagger UI (`POST /live-stream/start`) 등을 통해 `CCTVID = 1` 스트리밍을 시작합니다.
2. 브라우저 주소창에 `http://localhost:8080/streams/cctv1/playlist.m3u8` 입력 시 파일이 다운로드되거나 재생되면 정상 연결된 것입니다.

---

## ❓ 문제 발생 가능 상황 정리 (Troubleshooting)

| 문제 상황 | 해결 방법 |
| :--- | :--- |
| **API 404 / 네트워크 에러** | `.env.local`의 `VITE_API_BASE`가 백엔드 실제 주소와 일치하는지, 백엔드 서버가 실행 중인지 확인하세요. |
| **WebSocket 실패** | `VITE_WS_URL`이 올바른지, 백엔드의 `/ws` 엔드포인트가 열려 있는지 확인하세요. |
| **CORS 오류** | 백엔드 CORS 설정에 `http://localhost:3000` 추가가 필요합니다. |
