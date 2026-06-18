# INNERVERSE 2.0 — DB · AI 서버 구축 플랜 + 규율 + React 업그레이드

> 짝꿍 문서: `PITCH_HANDOFF.md`(PPT/앱 TODO). 이 문서는 **백엔드(DB·AI) 구축**과 **개발 규율**, **React 업그레이드** 전용.
> 현재 스택: React 18.3 / Vite 5.4 / TS 5.8 / three 0.160 / zustand 4.5 / **backend = FastAPI(Python 3.12), GCP 배포 전제** (`backend/main.py`)

---

## ⚠️ 0. 제일 먼저 고칠 것 — 감정 라벨 불일치
현재 `backend/main.py`의 `/api/analyze`가 **옛날 감정 라벨(기쁨/슬픔/분노/불안/평온)** 을 반환함.
→ 프론트 `src/store/emotionStore.ts`의 **5감정 키와 반드시 일치**시켜야 함:

| 키 | 감정 | 영문 | 색 |
|---|---|---|---|
| `pos` | 고양 | Elated | `#3ec074` |
| `calm` | 평온 | Serene | `#46a6e6` |
| `ten` | 긴장 | Tense | `#d99a4e` |
| `sad` | 격앙 | Agitated | `#e0574e` |
| `emp` | 침체 | Depressed | `#9090c8` |

**이 5개 키는 프론트·백·DB 전부에서 절대 바꾸지 말 것.** (행성 색 블렌딩이 이 키에 묶여 있음)

---

## 1. 전체 아키텍처

```
[React 18 / Vite]  ──HTTPS──▶  [FastAPI on GCP Cloud Run]  ──▶  [AI: OpenAI APIs]
       │                              │
       └──────▶ [Supabase: Postgres + Auth + Storage + RLS] ◀────┘
```

- **DB/인증/스토리지: Supabase** 추천 (Postgres + Row Level Security + Auth + 파일 스토리지 한 번에). 일기/음성/사진 민감정보 + 권한 등급제에 적합.
- **AI 추론: FastAPI(GCP Cloud Run)** — 무상태 컨테이너, 오토스케일. 이미 `backend/main.py` 있음.
- 프론트는 Supabase JS SDK로 DB 직접 + AI는 FastAPI 호출.

---

## 2. DB 스키마 (Supabase / Postgres)

```sql
-- 유저
users(
  id uuid pk, email text, nickname text,
  streak int default 0, growth_stage int default 1,   -- 1~7 (StageMomo)
  plan text default 'free',                            -- free | premium
  consent_level int default 100,                       -- 0 | 70 | 100 (데이터 개방 비율)
  coins int default 0, created_at timestamptz
)
-- 일기 (멀티모달)
diaries(
  id uuid pk, user_id uuid fk, text text,
  audio_url text, photo_url text, source text,         -- text | voice | photo
  input_meta jsonb,                                    -- {duration, typing_speed, paste_ratio, edit_count} ← 조작 검증
  created_at timestamptz
)
-- 감정 분석 결과 (5감정)
emotion_analyses(
  id uuid pk, diary_id uuid fk, user_id uuid fk,
  pos int, calm int, ten int, sad int, emp int,        -- 0~100
  dominant text,                                       -- bloom|calm|tense|wither|void
  keywords jsonb, crisis_score float,                  -- 0~1 위기 신호
  created_at timestamptz
)
-- 행성 현재 상태
planets(user_id uuid pk, branch text, color text, stage int, updated_at timestamptz)
-- 소셜
friends(id, user_id, friend_id, status)               -- pending|accepted
planet_visits(id, visitor_id, host_id, coins_spent int, created_at)
hearts(id, from_user, to_user, diary_id, kind, created_at)   -- 위로의 하트(유료 아이템)
exchange_diaries(id, user_a, user_b, diary_a, diary_b, created_at)
-- 케어 (닥터컨텍)
crisis_events(id, user_id, diary_id, risk_score float, signal text,
  action text, created_at)                            -- escalated|dismissed (사용자 선택)
counselors(id, name, specialty, type, rating, is_partner bool)  -- 상담사|정신과
bookings(id, user_id, counselor_id, status, scheduled_at, fee int, commission int)
-- 결제/데이터 권한
transactions(id, user_id, amount int, kind text, created_at)    -- coin|subscription|item
consents(id, user_id, scope text, granted bool, masking_level int, updated_at)
-- 주간 리뷰
weekly_reviews(id, user_id, week date, summary text, dominant text, recommendations jsonb)
```

**RLS 원칙:** 기본 `user_id = auth.uid()` 만 읽기/쓰기. 친구 행성·공개 행성만 예외적 읽기. 일기 원문은 동의(consents) 통과 + 마스킹 후에만 집계 파이프라인으로.

---

## 3. AI 서버 API 계약 (FastAPI) — **먼저 고정하고 프론트/백 동시 개발**

```
POST /api/analyze       일기(text/audio) → {pos,calm,ten,sad,emp, dominant, keywords, crisis_score}
POST /api/momo/reply    {text, emotions, history} → {reply, escalate:bool}     # 모모 공감 답장
POST /api/crisis/check  {text} → {risk_score, signal, suggest_escalation}      # 위기 스크리닝
POST /api/vision        {photo} → {labels, scene, emotion_hint}                # 멀티모달 사진
GET  /api/weekly/{uid}  → {summary, dominant, calendar[7], recommendations}    # 주간 리뷰
POST /api/insights      (집계·차분 프라이버시 적용, B2B용. 개인 식별 불가)
```

**응답 규격 = 프론트 `emotionStore`와 1:1.** `/api/analyze`의 더미 응답을 위 5감정 키로 **지금 바로 교체**할 것.

---

## 4. AI 프롬프트 템플릿 (그대로 써도 됨)

### 4-1. 감정 분석 (Structured Output)
```
너는 감정 분석기다. 사용자의 일기를 읽고 Russell 순환모형 5감정의 '비율'을 0~100으로 매겨라.
- pos 고양(긍정·높은각성) / calm 평온(긍정·낮은각성) / ten 긴장(부정·높은각성)
- sad 격앙(부정·높은각성) / emp 침체(부정·낮은각성)
또한 핵심 키워드 3개, 위기신호 점수(crisis_score 0~1)를 산출하라.
crisis_score는 자해·자살·심각한 절망 표현이 강할수록 1에 가깝게. (진단이 아니라 신호 강도)
반드시 JSON만 출력: {"pos":n,"calm":n,"ten":n,"sad":n,"emp":n,"dominant":"...","keywords":[...],"crisis_score":n}
일기: """{text}"""
```

### 4-2. 모모 공감 답장 (페르소나)
```
너는 '모모', 유리로 빚어진 다정한 AI 감정 동반자다.
- 짧고(2~3문장) 따뜻하게, 판단·훈계·진단 금지.
- CBT 톤: 감정을 인정 → 생각을 살짝 다시 보게 → 작은 한 걸음 제안.
- crisis_score가 0.6 이상이면 위로 후 "지금은 저보다 전문가의 도움이 필요한 순간 같아요.
  비대면 상담을 연결해 드릴까요?"로 부드럽게 escalate 제안하고 escalate=true.
입력 감정: {emotions}  / 일기: {text}
출력 JSON: {"reply":"...","escalate":bool}
```

### 4-3. 규칙
- AI는 **진단하지 않는다.** 위기감지는 '트리거'일 뿐, 연계 여부는 항상 사용자 선택.
- 의료법: 직접 의료행위 X → 제휴 병원/플랫폼으로 아웃링크.

---

## 5. 개발 규율 (Conventions / Agent Rules)

1. **API 계약(3번)을 먼저 고정** → 프론트는 mock으로, 백은 실제로 동시 개발.
2. **5감정 키(pos/calm/ten/sad/emp) 불변.** 라벨·색은 `PITCH_HANDOFF.md` E절 기준값 따른다.
3. **시크릿은 `.env`** (`OPENAI_API_KEY`, `SUPABASE_*`) — 절대 커밋 금지. `.gitignore` 확인.
4. **민감정보:** 일기 원문 raw 저장 시 암호화 고려, 동의등급(consents) 체크 후에만 집계.
5. **위기/의료:** 진단 금지·아웃링크 원칙(위 4-3) 코드 주석에도 명시.
6. **DB 변경은 Supabase migration**으로만 (수동 콘솔 변경 금지).
7. **CORS:** 배포 시 `allow_origins=["*"]` → 실제 프론트 도메인으로 좁히기 (`main.py` 현재 `*`).
8. **타입 공유:** API 응답 타입을 `src/lib/api-types.ts`에 정의해 프론트/백 규격 일치.
9. 커밋: 기능 단위 작게, 한국어 메시지 OK. PR 단위로.

---

## 6. React / 의존성 업그레이드 플랜

> ⚠️ 이 앱은 **R3F(react-three-fiber)** 의존도가 높음. React 19 무지성 업그레이드는 3D가 깨질 수 있음.

### 경로 A — 안전 (추천, 지금)
- **React 18.3 유지**, 마이너만 정리: `npm outdated` → three/drei/vite/eslint 패치·마이너 업데이트.
- `npx update-browserslist-db@latest` (빌드 경고 제거).
- 효과: 안정성 ↑, 리스크 0.

### 경로 B — React 19 마이그레이션 (나중에, 묶어서)
React 19는 **R3F v9 + drei v10 + three 최신**이 함께 필요:
1. `@react-three/fiber@^9`, `@react-three/drei@^10`, `three@latest`로 동시 업
2. `react@19`, `react-dom@19`, `@types/react@19`, `@types/react-dom@19`
3. `npx types-react-codemod@latest preset-19 ./src` (타입 코드모드)
4. R3F v9 변경점 점검: JSX namespace, `extend` 방식, strict 타입
5. **전수 테스트**: `npm run build` + `/experience` 3D 수동 확인 (행성·아바타·은하수 렌더)
- 한 번에 하지 말고 **별도 브랜치 + 단계별 커밋.**

### 권장
**지금은 경로 A**(18 유지 + deps 정리)로 백엔드에 집중. React 19는 앱 기능 다 붙인 뒤 경로 B로.

---

## 7. 단계별 구축 로드맵

- ✅ **Phase 0 — 토대 (완료 2026-06):** API 계약 고정 · 스키마·RLS migration · `.env` · `/api/analyze` 5감정 교체
  - `backend/main.py`: `/api/analyze`를 5감정(pos/calm/ten/sad/emp)+dominant+keywords+crisis_score로 교체. dominant는 프론트 `decideBranch` 포팅(로직 일치 검증 완료). 나머지 5개 엔드포인트(momo/reply·crisis/check·vision·weekly·insights) 스텁 + Pydantic 모델. CORS는 `ALLOWED_ORIGINS` env로.
  - `src/lib/api-types.ts`: 6개 응답 타입, `EmoKey`/`BranchKey`는 constants.ts에서 재사용(드리프트 방지). tsc 통과.
  - `supabase/migrations/0001_init.sql`: 2절 전체 스키마 + RLS(본인 user_id, 행성 방문 읽기, 양자관계 당사자, counselors 공개읽기).
  - `.env.example` + `.gitignore`(.env/__pycache__ 등) + `backend/requirements.txt`.
  - ⏭️ 남은 셋업(수동): Supabase 프로젝트 생성 후 migration 적용, `.env` 실제 값 채우기.
  - ⚠️ Phase 1: `analyze_with_llm()` 채우면 자동으로 LLM 우선·휴리스틱 폴백 동작.
- ✅ **Phase 1 — 코어 루프 (코드 완료 2026-06, 키 주입 시 동작):**
  - `src/lib/supabase.ts`(lazy·env가드) · `src/services/auth.ts` · `src/hooks/useAuth.ts` · `src/pages/Login.tsx`(+`/login` 라우트) — Auth.
  - `src/lib/api.ts`(analyze/momo/crisis fetch 래퍼) · `src/services/diary.ts`(일기 CRUD + 분석 저장 + planets upsert).
  - `src/store/emotionStore.ts`에 `setEmotions()` 추가 → 분석 5감정이 **행성 색에 실반영**(GlassPlanet이 emo 블렌딩).
  - `src/components/DiaryComposer.tsx`(`/experience` 오버레이): 일기 → /api/analyze → 행성색 + 모모 답장 + (로그인 시) 저장. 위기면 전문가 아웃링크.
  - 백엔드 `analyze_with_llm()`: structured output(프롬프트 4-1) 실제 구현. **Gemini/OpenAI 자동 분기**(`_get_llm()`: GEMINI_API_KEY 우선 → OPENAI_API_KEY → 휴리스틱). Gemini는 OpenAI 호환 엔드포인트라 같은 SDK 사용. 모델: `GEMINI_MODEL`(기본 gemini-2.5-flash) / `OPENAI_MODEL`.
  - streak→성장단계는 기존 `streakToStage` 사용(로그인 시 프로필 streak 하이드레이트는 Phase 2에서 연결).
  - `@supabase/supabase-js` 의존성 추가(package.json).
  - ⚠️ 검증 메모: 신규 파일 tsc 클린. 편집 파일(App/Index/emotionStore)은 샌드박스 마운트 캐시 이슈로 tsc 거짓에러 → 로컬에서 `npm run build` 한 번 돌려 최종 확인 권장.
  - ⏭️ 키 주입 후: Supabase에 0001_init.sql 적용 + `.env`(VITE_SUPABASE_*, OPENAI_API_KEY) → 바로 동작.
- ✅ **Phase 2 — 케어(닥터컨텍) (코드 완료 2026-06):**
  - `src/services/care.ts`: 상담사 목록 · 위기 이벤트 기록(escalated/dismissed) · 예약(중개, 수수료 20% 자동).
  - `src/components/CarePanel.tsx`: escalate 시 상담사 목록·연결 모달 + 1393 안내. DiaryComposer 위기 버튼 → `uiStore.openCare()` 연결.
  - 백엔드 `/api/momo/reply`·`/api/crisis/check` 이미 escalate 로직 보유(Phase 0). 진단금지·아웃링크 원칙 유지.
- ✅ **Phase 3 — 소셜(C2C) (코드 완료 2026-06):**
  - `src/services/social.ts`: 친구 검색/요청/수락 · 행성 방문(코인 `spend_coins`) · 위로의 하트(유료) · 교환일기.
  - `src/services/profile.ts`: ensureProfile(로그인 시 멱등 생성) · 코인 RPC.
  - `src/components/SocialPanel.tsx`: 친구/요청 목록 · 검색·추가 · 방문/하트(코인 표시). `/experience` 우상단 "🌌 친구" 런처.
  - `src/store/uiStore.ts`: 케어/소셜 패널 토글.
  - migration `0002_social_and_seed.sql`: `user_cards` 공개뷰(email 비노출) · `spend_coins`/`add_coins` RPC · 상담사 5곳 시드.
  - ⚠️ 검증: 신규 6파일 tsc 클린. 편집 파일(App/Index/DiaryComposer/emotionStore)은 샌드박스 마운트 캐시로 tsc 거짓에러 → 로컬 `npm run build` 확인 권장.
  - ⏭️ 3D 연동(은하수 지도에 실제 친구 행성 배치 등)은 다음 단계. 현재는 패널 UI + 데이터까지.
- **Phase 4 — 멀티모달·리뷰:** Whisper STT · Vision 사진 · 주간 리뷰/캘린더
- **Phase 5 — 데이터/보안:** 동의 등급제 · 마스킹 · (B2B) 집계+차분 프라이버시 · 행동패턴 조작검증

---

## 8. 다음 세션 복붙 프롬프트

**백엔드 시작:**
```
INNERVERSE 백엔드 구축 시작. BACKEND_AI_PLAN.md 읽고 시작해.
먼저 Phase 0: (1) backend/main.py의 /api/analyze 더미를 5감정 키(pos/calm/ten/sad/emp)로 교체,
(2) src/lib/api-types.ts에 API 응답 타입 정의해서 프론트랑 규격 맞춰줘.
Supabase 스키마는 BACKEND_AI_PLAN.md 2번 기준으로 migration 파일 만들어줘.
```

**감정분석 AI 연결:**
```
Phase 1: OpenAI로 /api/analyze 실제 감정분석 붙여줘. 프롬프트는 BACKEND_AI_PLAN.md 4-1 사용.
응답을 프론트 emotionStore에 연결해서 행성 색이 실제 일기 감정대로 바뀌게 해줘.
OPENAI_API_KEY는 .env로, 커밋 금지.
```

**React 업그레이드 (안전 경로):**
```
React는 18 유지하고, deps만 안전하게 정리해줘 (npm outdated 기준 마이너·패치 + browserslist).
빌드/3D(/experience) 깨지는지 확인하고. React 19는 아직 하지 마 (R3F 때문).
```
