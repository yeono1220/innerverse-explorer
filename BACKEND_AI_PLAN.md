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

- **Phase 0 — 토대:** API 계약 고정 · Supabase 프로젝트·스키마·RLS · `.env` · `/api/analyze` 5감정으로 교체
- **Phase 1 — 코어 루프:** Auth(로그인) · 일기 CRUD · GPT 감정분석 연결 → **행성 색(5감정 블렌딩) 실제 반영** · streak→성장단계
- **Phase 2 — 케어(닥터컨텍):** 위기 스크리닝 · 모모 답장 · escalate → 상담/전문가 연계 · counselors/bookings
- **Phase 3 — 소셜(C2C):** 친구 · 은하수 · 행성 방문(코인) · 위로의 하트 · 교환일기
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
