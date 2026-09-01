// 03 · 홈 (아바타 + 모모 행성 + 진입 카드들)
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card, CapLabel } from "../ui/primitives";
import { HomeAvatarStage } from "../ui/HomeAvatarStage";
import { LevelBar } from "../ui/LevelBar";
import { EmotionBar } from "../ui/emotion";
import { useUserStore, todayStr, REWARDS } from "@/store/userStore";
import { useAppStore } from "@/store/appStore";
import { useDiaryStore, weekSummary } from "@/store/diaryStore";
import { STAGES, STAGE_LIST, streakToStage } from "@/diorama/growth";

export default function Home() {
  const nav = useNavigate();
  const user = useUserStore();
  const unread = useAppStore((s) => s.notifications.filter((n) => n.unread).length);
  const quests = useAppStore((s) => s.quests);
  const questsDate = useAppStore((s) => s.questsDate);
  const ensureQuestsForToday = useAppStore((s) => s.ensureQuestsForToday);
  useEffect(() => {
    ensureQuestsForToday();
  }, [ensureQuestsForToday]);
  // 오늘 것이 아니면(날짜 지남) 0으로 표시
  const questDone = questsDate === todayStr() ? quests.filter((q) => q.done).length : 0;
  const entries = useDiaryStore((s) => s.entries);
  const summary = weekSummary(entries.slice(0, 5)).slice(0, 3);
  const stage = streakToStage(user.streak);
  const stageSpec = STAGES[stage];
  const stagePct = ((stage - 1) / 6) * 100;
  // 내일 받게 될 출석 보상(연속이 이어진다고 가정)
  const nextReward = REWARDS[Math.min(user.streak, REWARDS.length - 1)] ?? 5;

  return (
    <>
      <StatusBar />
      <AppBar
        left={
          <IconButton onClick={() => nav("/notifications")} ariaLabel="알림">
            <span style={{ position: "relative" }}>
              🔔
              {unread > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    background: "#e87fb8",
                    color: "#fff",
                    fontSize: 9,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {unread}
                </span>
              )}
            </span>
          </IconButton>
        }
        right={<IconButton onClick={() => nav("/search")} ariaLabel="검색">🔍</IconButton>}
      />
      <Body tabbed>
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <CapLabel>MY UNIVERSE</CapLabel>
          <h2 style={{ fontSize: 23, fontWeight: 800, marginTop: 4 }}>{user.planetName}</h2>
          <p style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 4 }}>
            연속 {user.streak}일 기록 중
          </p>
        </div>

        {/* 레벨 스탯바 — 별조각은 수치 대신 "얼마나 찼는지"로만 보여준다 */}
        <div style={{ padding: "2px 2px 0" }}>
          <LevelBar />
        </div>

        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <HomeAvatarStage size={210} onClick={() => nav("/glass")} />
        </div>

        {/* 모모 7일 성장기 — 작은 진행 카드 */}
        <Card variant="purple" onClick={() => nav("/avatar/journey")}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.18em", fontWeight: 800, opacity: 0.85 }}>
                MOMO · {stageSpec.day}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>
                모모는 지금 <span style={{ color: "#ffe7a8" }}>{stageSpec.name}</span>
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 3 }}>
                7일 성장기 미리보기 →
              </div>
            </div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }} aria-hidden="true">
              {STAGE_LIST.map((s) => (
                <span
                  key={s.stage}
                  style={{
                    width: 6,
                    height: s.stage === stage ? 14 : s.stage <= stage ? 10 : 6,
                    borderRadius: 3,
                    background:
                      s.stage === stage
                        ? "#fff"
                        : s.stage <= stage
                        ? "rgba(255,255,255,.7)"
                        : "rgba(255,255,255,.22)",
                    boxShadow: s.stage === stage ? "0 0 6px rgba(255,255,255,.6)" : "none",
                    transition: ".2s",
                  }}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${stagePct}%`,
                height: "100%",
                background: "linear-gradient(90deg,#fff,#ffd58a)",
                transition: "width .4s ease",
              }}
            />
          </div>
        </Card>

        <Card variant="purple">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>오늘의 마음은 어때요?</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", marginTop: 3 }}>
                모모와 대화하거나 일기로 남겨봐요
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => nav("/momo/chat")}
                className="iv-iconbtn"
                aria-label="모모와 대화"
              >
                💬
              </button>
              <button
                onClick={() => nav("/diary/write")}
                className="iv-iconbtn"
                aria-label="일기 작성"
              >
                ✏️
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">
            <span>이번 주 감정 풍경</span>
            <button
              onClick={() => nav("/review")}
              style={{ background: "none", border: "none", color: "var(--iv-purple2)", fontSize: 12, cursor: "pointer" }}
            >
              자세히 →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.map((s) => (
              <EmotionBar key={s.label} label={s.label} pct={s.pct} />
            ))}
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card size="sm" onClick={() => nav("/attendance")}>
            <div style={{ fontSize: 22 }}>🌙</div>
            <div className="iv-card-title">출석 보상</div>
            <div className="iv-card-sub">{user.streak}일 연속 · 내일 ✦{nextReward}</div>
          </Card>
          <Card size="sm" onClick={() => nav("/quest")}>
            <div style={{ fontSize: 22 }}>✨</div>
            <div className="iv-card-title">오늘의 퀘스트</div>
            <div className="iv-card-sub">
              {questDone}/{quests.length} 완료 · {questDone === quests.length && quests.length > 0 ? "보상 받기" : "보상 대기"}
            </div>
          </Card>
          <Card size="sm" onClick={() => nav("/condition")}>
            <div style={{ fontSize: 22 }}>💗</div>
            <div className="iv-card-title">컨디션 체크</div>
            <div className="iv-card-sub">마음과 수면 기록</div>
          </Card>
          <Card size="sm" onClick={() => nav("/galaxy")}>
            <div style={{ fontSize: 22 }}>🌌</div>
            <div className="iv-card-title">은하수</div>
            <div className="iv-card-sub">{entries.length}개의 행성</div>
          </Card>
        </div>

        <Card size="sm" onClick={() => nav("/letter")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 26 }}>💌</div>
            <div style={{ flex: 1 }}>
              <div className="iv-card-title">과거의 편지가 도착했어요</div>
              <div className="iv-card-sub">3개월 전의 너에게서</div>
            </div>
            <div style={{ color: "var(--iv-purple2)", fontSize: 18 }}>›</div>
          </div>
        </Card>
      </Body>
    </>
  );
}
