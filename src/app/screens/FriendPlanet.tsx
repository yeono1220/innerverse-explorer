// 14 · 친구 행성 (방문 + 아바타 대화 + 감정 비교)
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, CapLabel } from "../ui/primitives";
import { Momo2D } from "../ui/planet";
import { HomeAvatarStage } from "../ui/HomeAvatarStage";
import { EmotionBar } from "../ui/emotion";
import { useAppStore } from "@/store/appStore";
import { useUserStore, PLANET_COLORS } from "@/store/userStore";
import { useDiaryStore, weekSummary } from "@/store/diaryStore";

const FAKE_FRIEND_SUMMARY = [
  { label: "차분" as const, pct: 38 },
  { label: "기쁨" as const, pct: 26 },
  { label: "사랑" as const, pct: 18 },
  { label: "슬픔" as const, pct: 18 },
];

// 데모: 친구의 '오늘' (교환일기 기반 기분·한 일). 새 친구는 _default.
const FRIEND_TODAY: Record<
  string,
  { emoji: string; primary: string; text: string; keywords: string[]; line: string }
> = {
  f1: { emoji: "🌸", primary: "차분", text: "산책하며 마음을 천천히 가라앉혔대요.", keywords: ["산책", "노을", "차"], line: "바람이 선선해서 오래 걸었어. 너 생각도 났고." },
  f2: { emoji: "🌧️", primary: "긴장", text: "발표 준비로 조금 긴장했지만 잘 넘겼대요.", keywords: ["발표", "커피", "마감"], line: "심장 쫄깃했는데 끝나니까 후련하더라." },
  f3: { emoji: "☀️", primary: "기쁨", text: "좋아하는 노래를 찾아서 하루가 들떴대요.", keywords: ["노래", "산책", "간식"], line: "노래 하나에 하루가 환해졌어!" },
  _default: { emoji: "🌙", primary: "차분", text: "오늘의 마음을 살며시 적어두었어요.", keywords: ["하루", "기록"], line: "별일 없었지만 그게 또 평온했어." },
};

export default function FriendPlanet() {
  const nav = useNavigate();
  const { id } = useParams();
  const friend = useAppStore((s) => s.friends.find((f) => f.id === id) ?? s.friends[0]);
  const userColor = useUserStore((s) => s.planetColor);
  const userName = useUserStore((s) => s.name);
  const myWeek = weekSummary(useDiaryStore.getState().entries.slice(0, 7)).slice(0, 4);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [chat, setChat] = useState<Array<{ who: string; text: string }>>([
    { who: friend?.name ?? "친구", text: "와줘서 고마워 🌸" },
  ]);

  const completeQuest = useAppStore((s) => s.completeQuest);
  useEffect(() => {
    completeQuest("q3"); // 친구 행성 방문 -> 퀘스트 자동 달성
  }, [completeQuest]);

  if (!friend) {
    return (
      <>
        <StatusBar />
        <AppBar back title="친구 행성" />
        <Body>
          <div style={{ textAlign: "center", color: "var(--iv-txt2)", padding: 40 }}>친구를 찾을 수 없어요.</div>
        </Body>
      </>
    );
  }

  const today = FRIEND_TODAY[friend.id] ?? FRIEND_TODAY._default;
  const myTone = PLANET_COLORS[userColor];

  const send = () => {
    if (!msg.trim()) return;
    setChat((c) => [...c, { who: "나", text: msg }]);
    const t = msg;
    setMsg("");
    window.setTimeout(() => {
      setChat((c) => [...c, { who: friend.name, text: `‘${t}’ 라구? 나도 그런 결에 있어 :)` }]);
    }, 600);
  };

  return (
    <>
      <StatusBar />
      <AppBar back title={`${friend.name}의 행성`} />
      <Body>
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CapLabel>FRIEND VISIT</CapLabel>
          {/* 친구 행성(3D) 메인 + 내 모모가 그 위에 방문 + 내 색 로컬 블룸 */}
          <div
            style={{
              position: "relative",
              width: 200,
              height: 200,
              margin: "12px auto 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HomeAvatarStage color={friend.planetColor} size={188} rotating />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "44%",
                width: 116,
                height: 116,
                transform: "translate(-50%,-50%)",
                borderRadius: "50%",
                background: `radial-gradient(circle, ${myTone.glow} 0%, transparent 66%)`,
                filter: "blur(9px)",
                pointerEvents: "none",
                mixBlendMode: "screen",
                opacity: 0.8,
              }}
            />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>{friend.name}의 행성</h2>
          <p style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 4 }}>
            {friend.code} · 닮음 <b style={{ color: "var(--iv-purple2)" }}>{friend.similarity}%</b>
          </p>
          <p style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 6 }}>
            {userName}의 색이 {friend.name}의 행성에 살며시 번졌어요 ✦
          </p>
        </div>

        {/* 오늘의 친구 — 교환일기 기반 기분·한 일 */}
        <Card>
          <div className="iv-section-h">오늘의 {friend.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 30 }}>{today.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                주로 <span style={{ color: "var(--iv-purple2)" }}>‘{today.primary}’</span>의 결이에요
              </div>
              <div style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 2, lineHeight: 1.5 }}>{today.text}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {today.keywords.map((k) => (
              <span
                key={k}
                style={{ fontSize: 11, color: "var(--iv-txt2)", background: "var(--iv-surf2)", padding: "3px 9px", borderRadius: 999 }}
              >
                #{k}
              </span>
            ))}
          </div>
        </Card>

        {/* 교환일기 */}
        <Card>
          <div className="iv-section-h">교환일기</div>
          <div
            style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--iv-txt)", background: "var(--iv-surf2)", borderRadius: 12, padding: "10px 12px" }}
          >
            <span style={{ color: "var(--iv-txt3)" }}>{friend.name}의 오늘 한 줄</span>
            <br />“{today.line}”
          </div>
          <Button block onClick={() => setSent(true)} disabled={sent} style={{ marginTop: 10 }}>
            {sent ? "✓ 내 오늘 일기를 보냈어요" : "내 오늘 일기 교환하기"}
          </Button>
        </Card>

        <Card>
          <div className="iv-section-h">감정 비교</div>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--iv-txt3)", marginBottom: 6 }}>나 ({userName})</div>
              {myWeek.map((s) => (
                <EmotionBar key={s.label} label={s.label} pct={s.pct} showLabel={false} />
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--iv-txt3)", marginBottom: 6 }}>{friend.name}</div>
              {FAKE_FRIEND_SUMMARY.map((s) => (
                <EmotionBar key={s.label} label={s.label} pct={s.pct} showLabel={false} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 8, lineHeight: 1.6 }}>
            이번 주는 <b style={{ color: "var(--iv-green)" }}>‘차분’</b>의 결이 겹쳐요.
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">아바타 대화</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 160,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {chat.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: c.who === "나" ? "flex-end" : "flex-start",
                  alignItems: "flex-end",
                  gap: 6,
                }}
              >
                {c.who !== "나" && <Momo2D size={22} />}
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "8px 12px",
                    borderRadius: 14,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    background: c.who === "나" ? "linear-gradient(135deg,#7c6fe8,#a394f7)" : "var(--iv-surf2)",
                    color: "#fff",
                  }}
                >
                  {c.text}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              className="iv-input"
              placeholder={`${friend.name}에게 한마디…`}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              style={{ flex: 1, padding: "10px 12px" }}
            />
            <button
              onClick={send}
              className="iv-iconbtn"
              style={{ background: "linear-gradient(135deg,#7c6fe8,#a394f7)", border: "none" }}
              aria-label="보내기"
            >
              ➤
            </button>
          </div>
        </Card>

        <Button variant="ghost" block onClick={() => nav("/galaxy")}>
          내 은하수로 돌아가기
        </Button>
      </Body>
    </>
  );
}
