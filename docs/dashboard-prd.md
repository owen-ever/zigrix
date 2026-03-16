# Zigrix Dashboard — Product Requirements Document

_Created: 2026-03-16_

## Overview
Zigrix 전용 웹 대시보드. `~/.zigrix/` 상태를 실시간 시각화하고, 태스크 오케스트레이션 흐름을 모니터링한다. xnote 대시보드의 오케스트레이션 메뉴를 참고하되, Zigrix 독립 제품으로 구현.

## Tech Stack
- **Framework**: Next.js 15+ (App Router, SPA)
- **Language**: TypeScript
- **Styling**: CSS Modules (xnote 패턴 참조)
- **Realtime**: SSE (Server-Sent Events), WebSocket은 확장 시 검토
- **Auth**: 자체 세션 토큰 (HMAC-SHA256, httpOnly cookie)
- **Data**: `~/.zigrix/` 파일 직접 읽기 + fs.watch
- **DB**: 초기 파일 기반, 확장 시 SQLite/Redis 검토
- **Package**: `zigrix-dashboard` (별도 npm 패키지 또는 zigrix monorepo)

## Layout (SPA)

```
┌─────────────────────────────────────────────────┐
│  Header: 로고 + SSE 상태 + 새로고침 + 사용자 메뉴 │
│  Status Bar: OPEN(n) IN_PROGRESS(n) BLOCKED(n)   │
│             DONE_PENDING_REPORT(n) REPORTED(n)   │
├──────────┬──────────────────────────────────────┤
│          │  Tabs: [태스크 상세] [이벤트 로그]      │
│  Task    │        [대화 내역]                     │
│  List    │──────────────────────────────────────│
│          │                                      │
│  ・상태별 │  선택된 탭 컨텐츠                      │
│   필터   │                                      │
│  ・검색   │                                      │
│  ・정렬   │                                      │
│  ・페이지 │                                      │
│   네이션  │                                      │
│          │                                      │
├──────────┴──────────────────────────────────────┤
│  Agent Cards: 에이전트 카드 그리드 (6개)           │
└─────────────────────────────────────────────────┘
```

## Pages / Views

### Task List (좌측 사이드바 — 항상 표시)
- 태스크 카드 목록 (taskId, status 뱃지, actor)
- 상태별 필터: ALL / OPEN / IN_PROGRESS / BLOCKED / DONE_PENDING_REPORT / REPORTED
- 정렬: 최신순 / 오래된순 / taskId순
- 페이지네이션 (12건/페이지)
- 클릭 시 우측 패널 업데이트
- 실시간: 새 태스크/상태 변경 자동 반영

### 우측 패널 — 3탭 구조

#### Tab 1: 태스크 상세 (Task Detail)
- 상태 뱃지 (icon + 한글 라벨)
- title, scale, created, updated
- Execution Units (있을 경우):
  - unitId, title, status, workerAgent
  - workPackage별 진행률 (체크/미체크)
  - 진행률 퍼센트 바
- Spec 요약 (meta.json 기반)
- Evidence 요약 (에이전트별 제출 상태)

#### Tab 2: 이벤트 로그 (Event Log)
- tasks.jsonl 기반 이벤트 스트림
- 시간순 (최신 위)
- 포맷: `[시간] event_name task=taskId status=status actor=actor`
- worker_dispatched는 `actor → targetAgent` 표시
- 실시간 push

#### Tab 3: 대화 내역 (Conversation)
- 에이전트별 세션 메시지 시간순 병합
- 메시지 유형:
  - assistant: 마크다운 렌더링
  - user: 마크다운 렌더링
  - toolCall: 도구명 뱃지 + arguments 요약 (debug mode)
  - toolResult: 도구명 뱃지 + 결과 (debug mode)
  - thinking: 접기/펼치기 (debug mode)
- Debug 토글: 켜면 tool/thinking 표시, 끄면 assistant text만
- 에이전트별 색상 + 이모지 구분
- 자동 스크롤 (하단 근처 시)
- **데이터 소스**: OpenClaw gateway sessions_history API 또는 세션 파일 직접 읽기

### Agent Cards (하단 그리드)
- 6개 에이전트 카드 (pro/front/back/sys/sec/qa-zig)
- 카드별: 이모지 + agentId + 상태(작업중/대기중) + model + 최근 task
- 실시간 업데이트

### Status Bar (헤더 하단)
- 상태별 태스크 수 (OPEN, IN_PROGRESS, BLOCKED, DONE_PENDING_REPORT, REPORTED)

## Authentication

### 위협 모델
- 외부 노출 시 오케스트레이션 데이터 전체 노출 위험
- 태스크 데이터에 내부 프로젝트 정보 포함 가능
- 대화 내역에 민감 코드/토큰 포함 가능

### 최초 Setup Flow
1. 서버 시작 후 첫 접속 → 관리자 계정 존재 여부 확인
2. 계정 없음 → Setup 화면 표시
   - 관리자 username 입력
   - password 입력 (최소 8자)
   - password 확인
3. bcrypt 해시 + JWT secret(crypto.randomBytes(64)) 생성
4. `~/.zigrix/dashboard.json`에 저장 (파일 권한 600)
5. 자동 로그인 → 대시보드 진입
6. Setup 화면은 관리자 존재 시 404

### 인증 흐름
- POST `/api/auth/login` → username + password → bcrypt 검증
- 성공: HMAC-SHA256 세션 토큰 발급 (httpOnly cookie)
- 세션 TTL: 12시간
- 로그아웃: cookie 삭제
- SSE 연결 시 cookie 기반 인증
- 미인증 접근: `/login` 리다이렉트

### 보안 체크리스트
- [ ] bcrypt cost factor ≥ 12
- [ ] JWT/세션 secret은 파일 권한 600
- [ ] CORS origin 제한 (기본 localhost, 설정 확장 가능)
- [ ] Rate limit on login: 5회/분
- [ ] Setup endpoint는 관리자 존재 시 404 반환
- [ ] SSE handshake에서 cookie 토큰 검증
- [ ] 에러 메시지에 내부 정보 노출 금지
- [ ] 타이밍 안전 비교 (timingSafeEqual)

## Realtime (SSE)

### 서버
- `~/.zigrix/` 디렉토리 fs.watch (recursive)
- 변경 감지 시 변경 유형 판별 → 해당 클라이언트에 이벤트 push

### 이벤트 타입 (xnote 참조)
| SSE Event | 내용 |
|-----------|------|
| `update` | 초기 로드 시 overview 전체 |
| `event_update` | recentEvents, taskHistory, bucketCounts 변경 |
| `runs_update` | agentCards 변경 |
| `conversation_update` | 특정 태스크 대화 스트림 변경 |
| `task_detail_update` | 특정 태스크 상세 변경 |

### 클라이언트
- 수신 시 해당 영역만 업데이트 (전체 새로고침 X)
- 머지 로직으로 중복 제거 (xnote mergeByKey 패턴)
- SSE 연결 끊김 시 자동 재연결 (EventSource 기본 동작)

## Data Sources

### Primary: `~/.zigrix/` 파일
| 파일 | 용도 |
|------|------|
| `tasks/*.meta.json` | 태스크 메타데이터 |
| `tasks/*.md` | 태스크 스펙 (마크다운) |
| `tasks.jsonl` | 이벤트 로그 (append-only) |
| `evidence/<taskId>/*.json` | 에이전트별 증적 |
| `evidence/<taskId>/_merged.json` | 병합 증적 |
| `index.json` | 상태 프로젝션 (derived) |
| `zigrix.config.json` | 에이전트/규칙 설정 |

### Secondary: OpenClaw Gateway API (대화 내역)
- `sessions_history` — 에이전트 세션 메시지 조회
- fallback: 세션 파일 직접 읽기 (`~/.openclaw/agents/<agentId>/sessions/`)

### Dashboard Config: `~/.zigrix/dashboard.json`
- 관리자 계정 해시
- 세션 secret
- CORS 설정
- 기타 대시보드 설정

## CLI Integration
```bash
# 대시보드 서버 시작
zigrix dashboard start [--port 3000]

# 대시보드 서버 중지
zigrix dashboard stop

# 대시보드 상태 확인
zigrix dashboard status
```

## Non-goals (v1)
- 대시보드에서 태스크 생성/수정 (읽기 전용, 중단만 가능)
- 멀티 유저 / RBAC
- 모바일 최적화 (데스크톱 우선)
- 다크 모드 (v2)

## xnote 참조 포인트
- `OrchestrationClient.tsx`: 전체 레이아웃, 탭 구조, 머지 로직
- `orchestration-store.ts`: 데이터 로딩, 이벤트 파싱, 세션 해석
- `auth.ts`: HMAC 세션 토큰 패턴
- `stream/route.ts`: SSE 구현 패턴
- CSS Modules: 스타일 패턴

## 구현 우선순위
1. 프로젝트 초기화 (Next.js + TypeScript)
2. 인증 (Setup + Login + 세션)
3. 데이터 로딩 레이어 (orchestration-store 포팅)
4. 좌측 Task List
5. 우측 태스크 상세 탭
6. 우측 이벤트 로그 탭
7. 우측 대화 내역 탭
8. Agent Cards
9. SSE 실시간
10. CLI 통합 (dashboard start/stop/status)
