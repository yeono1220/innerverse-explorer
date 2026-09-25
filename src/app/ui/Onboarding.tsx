// 첫 방문 30초 온보딩 — 3장. 2장에서 감정 하나를 고르면 홈 행성이 즉시 물든다
// (emotionStore.setEmotions → HomeAvatarStage 의 branch/soul 반영).
// 한 번 본 뒤엔 localStorage 플래그로 숨긴다. 계정 전환 시 플래그도 같이 지워져 다시 보인다.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./primitives";
import { Planet2D } from "./planet";
import { EMOTION_COLORS, type EmotionLabel } from "@/store/diaryStore";
import { useEmotionStore } from "@/store/emotionStore";
import { SLUG_OF } from "@/glass-momo/constants";

const KEY = "innerverse.onboarded";
export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
function markOnboarded() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

const EMOS: EmotionLabel[] = ["기쁨", "차분", "사랑", "슬픔", "분노", "긴장", "공허"];
const MOMO_LINE: Record<EmotionLabel, string> = {
  기쁨: "와, 좋은 일이 있었구나! 행성이 금빛으로 번졌어 ✨",
  차분: "잔잔한 하루였구나. 초록 결이 행성에 깔렸어 🌿",
  사랑: "따뜻한 마음이 번졌네. 분홍빛이 스며들었어 🌸",
  슬픔: "많이 무거웠지. 푸른빛으로 감싸줄게 🌊",
  분노: "많이 화났겠다. 그럴 만했어. 붉은 결도 네 마음의 일부야 🔥",
  긴장: "긴장됐겠다. 호박빛이 떨리고 있어. 호흡 한 번 같이 할까 🍂",
  공허: "텅 빈 느낌이 들었구나. 그런 날엔 안 해도 괜찮아 🌙",
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<EmotionLabel | null>(null);
  const setEmotions = useEmotionStore((s) => s.setEmotions);

  const finish = (to?: string) => {
    markOnboarded();
    onDone();
    if (to) nav(to);
  };
  const pick = (e: EmotionLabel) => {
    setPicked(e);
    // 고른 감정 70 + 차분 30 → 행성 분기·색이 바로 바뀐다
    setEmotions({ [SLUG_OF[e]]: 70, calm: e === "차분" ? 100 : 30 });
  };

  const dots = (
    <div style={{ display: "flex", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: i === step ? 22 : 8,
            height: 8,
            borderRadius: 999,
            background: i === step ? "var(--iv-purple2)" : "rgba(255,255,255,.18)",
            transition: "width .25s",
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="시작하기"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: "rgba(7,6,13,0.86)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 18,
      }}
    >
      <div
        style={{
          background: "linear-gradient(180deg, rgba(27,20,48,.98), rgba(12,10,22,.98))",
          border: "1px solid rgba(163,148,247,.35)",
          borderRadius: 24,
          padding: "22px 20px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          {dots}
          <button
            onClick={() => finish()}
            style={{ background: "none", border: "none", color: "var(--iv-txt3)", fontSize: 12, cursor: "pointer" }}
          >
            건너뛰기
          </button>
        </div>

        {step === 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}>
              <Planet2D color="green" size={110} withMomo />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>여기는 네 마음의 행성이야</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--iv-txt2)", margin: 0 }}>
              하루의 감정을 남기면 행성의 색이 바뀌고, 기록 하나마다 표면에 구조물이 생겨. 옆에 있는 친구는 모모 —
              네 이야기를 기억하는 AI 동반자야.
            </p>
            <Button block style={{ marginTop: 16 }} onClick={() => setStep(1)}>
              다음
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>지금 기분은 어때?</h2>
            <p style={{ fontSize: 13, color: "var(--iv-txt2)", margin: "0 0 12px" }}>하나만 골라봐. 행성이 바로 반응할 거야.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EMOS.map((e) => {
                const on = picked === e;
                return (
                  <button
                    key={e}
                    onClick={() => pick(e)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 999,
                      border: `1.5px solid ${on ? EMOTION_COLORS[e] : "rgba(255,255,255,.14)"}`,
                      background: on ? EMOTION_COLORS[e] : "rgba(255,255,255,.05)",
                      color: on ? "#0c0a16" : "var(--iv-txt)",
                      fontWeight: 700,
                      fontSize: 13.5,
                      cursor: "pointer",
                      transition: "all .15s",
                    }}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                minHeight: 44,
                marginTop: 12,
                fontSize: 13,
                lineHeight: 1.6,
                color: picked ? "var(--iv-txt)" : "var(--iv-txt3)",
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(124,111,232,.14)",
              }}
            >
              {picked ? `모모: ${MOMO_LINE[picked]}` : "…"}
            </div>
            <Button block style={{ marginTop: 14 }} disabled={!picked} onClick={() => setStep(2)}>
              {picked ? "다음" : "감정을 골라줘"}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>이제 기록을 남겨볼까?</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--iv-txt2)", margin: "0 0 14px" }}>
              글·음성·사진으로 일기를 쓰면 모모가 감정을 읽고, 왜 그렇게 느꼈는지·다르게 볼 여지·작은 한 걸음을 함께 알려줘.
              쌓인 기록은 모모가 다음 대화에서 기억해.
            </p>
            <Button block onClick={() => finish("/diary/write")}>
              ✏️ 첫 일기 쓰기 (3분)
            </Button>
            <Button block variant="ghost" style={{ marginTop: 8 }} onClick={() => finish("/momo/chat")}>
              💬 모모와 먼저 이야기하기
            </Button>
            <button
              onClick={() => finish()}
              style={{ display: "block", width: "100%", background: "none", border: "none", color: "var(--iv-txt3)", fontSize: 12, marginTop: 10, cursor: "pointer" }}
            >
              둘러보기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
