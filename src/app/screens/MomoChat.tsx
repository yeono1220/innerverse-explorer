// 16 · 모모 대화 (말풍선 + 실시간 감정 태깅 + 추천 답변)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Momo2D } from "../ui/planet";
import { EmotionDot } from "../ui/emotion";
import type { EmotionLabel } from "@/store/diaryStore";
import { momoReply } from "@/lib/api";
import { ragContext } from "@/services/rag";
import { getMemory, memoryPromptBlock } from "@/services/memory";
import { CareSheet } from "../ui/CareSheet";

interface Msg {
  id: number;
  who: "momo" | "me";
  text: string;
  emo?: EmotionLabel;
  memory?: string[]; // RAG로 참조한 과거 일기 미리보기
}

const SUGGESTIONS = ["조금 무기력해", "오늘 좀 신났어", "긴장돼서 잠이 안 와", "그냥 평범한 하루였어"];

const REPLIES: Array<{ keys: RegExp; reply: string; emo: EmotionLabel }> = [
  { keys: /무기력|공허|텅|허무/, reply: "텅 빈 느낌이 들었구나. 그런 날엔 무언가 안 해도 괜찮아.", emo: "공허" },
  { keys: /신났|기뻤|좋았|행복/, reply: "와, 좋은 일이 있었구나! 그 기억 오래 머물게 해줄게 ✨", emo: "기쁨" },
  { keys: /불안|긴장|초조|걱정/, reply: "긴장됐겠다. 호흡 한번 같이 해볼까? 들이쉬고… 천천히 내쉬고.", emo: "긴장" },
  { keys: /슬|눈물|외|지쳤|아프/, reply: "많이 무거웠지. 내가 곁에 있어. 천천히 얘기해줘.", emo: "슬픔" },
  { keys: /평범|괜찮|담담|쉬/, reply: "잔잔한 하루였구나. 그 결도 행성 위에 차곡차곡 쌓일 거야 🌿", emo: "차분" },
];

export default function MomoChat() {
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 1, who: "momo", text: "오늘 마음은 어때? 천천히, 떠오르는 대로 들려줘 🌙" },
  ]);
  const [input, setInput] = useState("");
  const [careOpen, setCareOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const rule = REPLIES.find((r) => r.keys.test(t));
    const userMsg: Msg = { id: Date.now(), who: "me", text: t, emo: rule?.emo };
    setMsgs((m) => [...m, userMsg]);
    setInput("");

    // 최근 6개 대화 기록을 history로 전달
    const history = [...msgs, userMsg].slice(-6).map((m) => `${m.who}: ${m.text}`);

    // RAG: 과거 일기 검색 → 모모 답장에 컨텍스트 주입
    let reply = rule?.reply ?? "조금 더 들려줄래? 어떤 순간이었는지.";
    let memory: string[] = [];
    try {
      const hits = await ragContext(t);
      memory = hits.map((h) => h.preview);
      const mem = await getMemory();
      const r = await momoReply({
        text: t,
        context: hits.map((h) => h.snippet),
        history,
        profile: memoryPromptBlock(mem),
      });
      if (r?.reply) reply = r.reply;
      if (r?.escalate) window.setTimeout(() => setCareOpen(true), 700); // 위기 감지 → 상담 연계
    } catch {
      /* 백엔드 실패 → 로컬 규칙 답장 유지 */
    }
    setMsgs((m) => [...m, { id: Date.now() + 1, who: "momo", text: reply, memory }]);
  };

  return (
    <>
      <StatusBar />
      <AppBar
        back
        title="모모와 대화"
        right={
          <IconButton onClick={() => nav("/momo/complete", { state: { msgs } })} ariaLabel="일기로 완성">
            ✓
          </IconButton>
        }
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start" }}>
              {m.who === "momo" && (
                <div style={{ marginRight: 8 }}>
                  <Momo2D size={32} />
                </div>
              )}
              <div
                style={{
                  maxWidth: "75%",
                  padding: "10px 14px",
                  borderRadius: 18,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  background:
                    m.who === "me"
                      ? "linear-gradient(135deg,#7c6fe8,#a394f7)"
                      : "var(--iv-surf2)",
                  color: "#fff",
                  border: m.who === "me" ? "none" : "1px solid var(--iv-line)",
                }}
              >
                {m.text}
                {m.emo && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 5,
                      fontSize: 11,
                      opacity: 0.9,
                    }}
                  >
                    <EmotionDot label={m.emo} />
                    {m.emo} 감지됨
                  </div>
                )}
                {m.memory && m.memory.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.5, color: "#cdb8ff", opacity: 0.85 }}>
                    🧠 기억 참조 · {m.memory.join(" / ")}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "0 18px 8px", display: "flex", gap: 6, overflowX: "auto" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                fontSize: 11.5,
                padding: "6px 11px",
                borderRadius: 999,
                background: "rgba(255,255,255,.05)",
                color: "var(--iv-txt2)",
                border: "1px solid var(--iv-line)",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          style={{ padding: "8px 18px 18px", display: "flex", gap: 8 }}
        >
          <input
            className="iv-input"
            placeholder="모모에게 들려주기…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="iv-iconbtn"
            style={{ background: "linear-gradient(135deg,#7c6fe8,#a394f7)", border: "none" }}
            aria-label="보내기"
          >
            ➤
          </button>
        </form>
      </div>
      <CareSheet open={careOpen} onClose={() => setCareOpen(false)} />
    </>
  );
}
