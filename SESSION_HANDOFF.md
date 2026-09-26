# INNERVERSE 세션 핸드오프 (2026-09-26)

> 새 대화에서 이 파일을 먼저 읽히면 이어서 작업할 수 있다. 실행 명령은 전부 비파괴적(읽기·빌드·배포 확인)이다.

## 0. 한 줄 상태
웹앱은 **innerverse-explorer.vercel.app** 에서 로그인 없이 체험 가능(익명 세션 + 시드 우주). 프론트 Vercel(자동 배포) · AI 백엔드 Render(**수동 배포**) · DB Supabase `xyypblaymphozvbrohco`. 원티드 AI 챔피언십 투표 진행 중, 모두의 창업 2차 결과 대기, KU 창업동아리 2학기 지원서 초안 완료.

## 1. 인프라 · 계정 (값은 넣지 않음)
| 것 | 어디 | 비고 |
|---|---|---|
| 프론트 | Vercel `yeono1220s-projects/innerverse-explorer` | `main` push → 자동 배포. 환경변수 3개(Production): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(208자 — 예전에 잘려 들어간 사고 있었음) |
| 백엔드 | Render `innerverse-explorer` (srv-dan546qjnfac73fdd65g), 무료 플랜 | **GitHub 웹훅이 안 붙어 자동 배포 안 됨** → Deploys → Manual Deploy → Deploy latest commit. 환경: `ANALYZER_BACKEND=claude`, `CLAUDE_MODEL=claude-sonnet-5`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`(조직 키라 필요), `SUPABASE_URL`, `ALLOWED_ORIGINS`, `APP_ENV=production`, `AUTH_MODE=supabase` |
| DB | Supabase 프로젝트 `xyypblaymphozvbrohco` (대시보드 이름 DBTest, ES256 서명) | Anonymous sign-ins ON. 마이그레이션은 `supabase/migrations/` 파일을 SQL Editor에 붙여넣어 실행(0001~0016 전부 적용됨) |
| 로컬 `.env` | 위 프로젝트를 가리킴. 옛 값은 `.env.bak-wtfj` | `VITE_API_URL`은 Render 주소 |
| 확인 | `curl https://innerverse-explorer.onrender.com/health` → `active_analyzer: claude`, `llm_calls_today / llm_daily_cap` | Render 무료라 첫 요청 50초(콜드스타트) |

## 2. 이번 세션에서 만든 것 (전부 main에 있음)
- **익명 로그인 + 시드 우주**: 세션 없으면 `signInAnonymously` → `seed_demo_universe()` RPC(0012)가 방문자 uid로 일기 7편·사실 5·관계 4·프로필(`user`/`user의 행성`, 연속 5일, Lv1)을 1회 복사. 실제 계정엔 절대 시드 안 됨.
- **Claude 전환**: 감정 분석·모모 대화·사진 해석(vision)·기억 요약 전부 `ClaudeAnalyzer`, `effort=low`(응답 22s→3s).
- **모모의 해석**: 분석 결과에 `insight{reason,reframe,next_step}` → `diary_entries.insight`(0016) → 결과 화면·상세의 `InsightCard`.
- **RAG 본문 노출**: 모모 프롬프트에 과거 일기 본문 발췌(140자) 포함, 날짜 대신 사건·사람으로 인용.
- **멀티모달**: 텍스트 / 음성(브라우저 STT, 오디오 미저장) / 사진(Claude vision) / 위치(역지오코딩 → 동네 이름, 좌표 미저장, 권한 거부 안내).
- **안전·비용**: 위기 단어 프론트 즉시 감지 → 1393 카드; 하루 10턴(플러스도 동일); 서버 전역 일일 LLM 상한 3000 + uid 80/일 + IP 300/일(`llm_guard`); 초과 시 규칙 기반 폴백.
- **공유 카드**: `src/lib/shareCard.ts` — 일기 1편 → 9:16 PNG(canvas, 비용 0). 모바일 OS 공유 시트 / PC 다운로드+링크 복사. `utm_source=share`.
- **온보딩**: 첫 방문 3장(행성 소개 → 감정 탭하면 행성 즉시 반응 → 첫 일기/모모 CTA). `localStorage innerverse.onboarded`.
- **행성 주민**: `src/planet-items/PlanetPeople.tsx` — `relations`(장기기억)의 사람들을 행성 위 이니셜 마커로. 탭 → `/search?q=이름`. 홈·/glass 공통.
- **출석 DB 연동**: `profiles.last_check_in`(0015), `saveProgress` upsert→update 버그 수정, 재하이드레이트 레이스 수정.
- **에셋 슬롯**: `public/momo/momo.png`(3D 모모 렌더본, `/dev/momo-render`에서 재생성), `public/items/i1~i7.png` 넣으면 자동 교체.
- **Sentry**: `VITE_SENTRY_DSN` / `SENTRY_DSN` 넣으면 켜짐(아직 DSN 없음).
- **기타**: 파비콘(행성), Lovable 잔재 제거, 모바일 스크롤 고정, 위치·음성 UI 정직화(가짜 재생 버튼 제거).

## 3. 아직 사람이 해야 할 것
1. Anthropic 콘솔 **지출 한도**(console.anthropic.com/settings/limits, 월 $90 권장)
2. Render **유료 전환**($7) 또는 UptimeRobot로 `/health` 10분 핑 — 콜드스타트 제거
3. Sentry 가입 → DSN 2개를 Vercel/Render 환경변수에
4. Render GitHub 웹훅 복구(Settings → Repository → Reconnect) — 안 하면 백엔드 바뀔 때마다 수동 배포
5. yejin님 전달: 에셋 파일명 규칙, **스키마 변경은 마이그레이션 파일로**(대시보드 직접 수정으로 `nickname NOT NULL` 사고 있었음)
6. KU 창업동아리 서류: `Documents/대학교 활동/26-1/KU 창업동아리/KU창업동아리_2026-2_plan-it_지원서류_초안.docx` + `INNERVERSE_시스템구성도.png` — 빈칸(학년·생년월일·송욱봉 정보·인호 교수님 성함) 채워서 HWP에 옮기기

## 4. 다음 작업 후보 (우선순위 순)
1. **푸시 알림** — PWA 웹 푸시 또는 Capacitor. 리텐션의 핵심. (공유 카드만으로는 바이럴 유입이 그날 이탈)
2. **클로즈드 베타 100명 + 측정** — D1/D7/D30, 일기 수, 구독 전환 의향 대시보드
3. **모모 캐릭터 바이블** — 말투·금지어·리듬, 이름 부르기, 세션 간 대화 이어받기(지금 history 6턴)
4. **신뢰 장치** — 개인정보처리방침, "내 데이터 전체 삭제", 위기 대응 흐름 문서
5. **기능 다이어트** — 홈 카드 8→3, 안 쓰는 화면 숨기기
6. 시드 우주 끄는 시점 결정(0012 RPC 비활성) — 그때 온보딩이 진짜 첫 경험이 됨

## 5. 열린 질문: 행성 주민의 캐릭터 (사용자 질문 + 제안)
**질문(고연오)**: 인물들을 행성 위에 떠다니게 할지, 석상(statue)처럼 세울지. 인물 캐릭터의 스코프도 정해야 함.

**제안(Claude)**: 둘을 섞되 기본은 **표면 위 저폴리 피규어**, 상태 변화는 **떠다니는 요소**로.
- **형태**: 모모와 같은 결(구 머리 + 캡슐 몸, 결정면 아님)로 코드 생성 — 에셋 0, 모모 옆에 서도 이질감 없음. 머리 위에 이름 라벨.
- **관계 데이터 → 시각 속성**
  | 데이터 | 표현 |
  |---|---|
  | `sentiment` 긍정/중립/갈등 | 몸 색(초록/하늘/주황) · 갈등이면 모모에게서 등을 돌린 자세 |
  | 언급 횟수 (신규 컬럼 `mention_count`) | 피규어 크기 0.8~1.3배 |
  | 마지막 언급일 (`last_mentioned`) | 30일 넘으면 반투명·"잠든" 표시, 다시 언급되면 깨어남 |
  | 최근 함께 나온 감정 (신규 `last_emotion`) | 머리 위 작은 감정색 구슬이 **떠다님** — "떠다니는" 요소는 여기 |
  | 관계 유형(가족/친구/동료/연인) | 머리 장식 하나(리본·모자·안경) 정도로만 |
- **인터랙션**: 탭 → 그 사람 일기 목록(지금 구현됨) + "모모에게 이 사람 얘기하기" 버튼 → 모모 대화가 그 사람 컨텍스트로 시작.
- **스코프 상한**: 표시 12명(언급 순), 이름 5자, 사용자가 `/memory`에서 "잊기"하면 사라짐.
- **필요한 작업**: `relations`에 `mention_count int`, `last_emotion text` 컬럼(마이그레이션) + `reflect` 갱신 로직 + `PlanetPeople` 피규어 지오메트리(반나절). 석상 버전은 피규어를 회색·정적 포즈로 두는 변형이라 같은 코드에서 토글 가능.
- 대안 A "정령 오브(orb)" — 감정색 발광 구가 낮은 궤도로 떠다님, 관계 거리 = 궤도 반경. 에셋 0이고 예쁘지만 "사람"으로 읽히기 어려움. 홈 화면 밀도가 이미 높아 비추천.

## 6. 함정 · 팁
- Windows: 소스는 CRLF 혼재. 파이썬으로 편집할 때 `\r\n`→`\n` 정규화 후 되돌리기. 콘솔 출력은 `PYTHONIOENCODING=utf-8`.
- `backend/main.py`에 `/health`가 3개 정의돼 있고 앞 2개는 `'''` 주석 블록 안(죽은 코드). 살아 있는 건 마지막 것.
- `supabase/migrations/0013_*.sql`이 두 개(팀원 `user_items`, 내 `anon_safe_profile_trigger`) — 둘 다 적용됨, 번호만 충돌.
- 타입체크: `npx tsc -p tsconfig.app.json --noEmit` — `AddFriend.tsx/FriendPlanet.tsx`의 `Friend.id` 에러 5개는 팀원 코드 기존 문제(빌드엔 영향 없음).
- Claude in Chrome 확장은 Supabase SQL 에디터에서 자주 멈춤 → SQL은 파일로 만들어 사용자에게 붙여넣기 요청이 빠름. Render 배포 메뉴는 좌표 클릭(1428,130) 후 `find "menuitem Deploy latest commit"`.
- 내장 브라우저 패널은 마이크·위치 권한이 막혀 있음(앱 문제 아님).
- 익명 테스트 계정이 DB에 계속 쌓임 → 대회 끝나면 `delete from auth.users where is_anonymous and created_at < now() - interval '30 days'`(이건 의도적 정리이니 실행 전 확인).

## 7. 자주 쓰는 경로
- 앱: `src/app/screens/*`, UI: `src/app/ui/*`, 3D: `src/diorama/`, `src/glass-momo/`, `src/planet-items/`
- 서비스: `src/services/{auth,demoSeed,diaryApi,memory,rag,profileApi,cloudSync}.ts`, API: `src/lib/api.ts`
- 백엔드: `backend/{main,analyzers,auth,config}.py` — 프롬프트는 `analyzers.py`의 `PROMPT_ANALYZE`, `PROMPT_MOMO_SYSTEM`
- DB: `supabase/migrations/0001~0016`, 재실행용 `supabase/RUN_ME_*.sql`
- 지원서류·구성도: `Documents/대학교 활동/26-1/KU 창업동아리/`
