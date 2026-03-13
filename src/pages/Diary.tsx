import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import StarField from "@/components/StarField";
import EmotionBar from "@/components/EmotionBar";

type Emotion = {
  label: string;
  value: number;
  color: string;
  keywords: string[];
};

const EMOTION_BASELINE: Emotion[] = [
  { label: "기쁨", value: 20, color: "hsl(45, 96%, 55%)", keywords: ["기쁘", "행복", "뿌듯", "좋", "감사", "신나", "설레"] },
  { label: "슬픔", value: 20, color: "hsl(217, 91%, 60%)", keywords: ["슬프", "우울", "눈물", "힘들", "외롭", "지쳤"] },
  { label: "분노", value: 20, color: "hsl(348, 83%, 60%)", keywords: ["화", "짜증", "답답", "억울", "열받", "분노"] },
  { label: "불안", value: 20, color: "hsl(258, 58%, 58%)", keywords: ["불안", "걱정", "초조", "긴장", "무섭", "두렵"] },
  { label: "평온", value: 20, color: "hsl(187, 80%, 42%)", keywords: ["평온", "편안", "안정", "차분", "괜찮", "담담"] },
];

const analyzeEmotion = (input: string): Emotion[] => {
  const normalized = input.toLowerCase();

  const scored = EMOTION_BASELINE.map((emotion) => {
    const matchedCount = emotion.keywords.reduce((count, keyword) => {
      return count + (normalized.includes(keyword) ? 1 : 0);
    }, 0);

    return {
      ...emotion,
      value: emotion.value + matchedCount * 18,
    };
  });

  const total = scored.reduce((sum, emotion) => sum + emotion.value, 0);

  return scored.map((emotion) => ({
    ...emotion,
    value: Math.round((emotion.value / total) * 100),
  }));
};

const Diary = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"write" | "loading" | "result">("write");
  const [result, setResult] = useState(EMOTION_BASELINE);
  const [insight, setInsight] = useState("");

  const handleSubmit = () => {
    if (!text.trim()) return;

    const analyzed = analyzeEmotion(text);
    const strongest = [...analyzed].sort((a, b) => b.value - a.value)[0];

    setResult(analyzed);
    setInsight(`오늘은 '${strongest.label}' 감정이 가장 크게 포착됐어요. 이 감정이 올라온 순간을 떠올리며, 나를 지켜준 행동 하나를 적어보세요.`);
    setPhase("loading");
    setTimeout(() => setPhase("result"), 2500);
  };

  return (
    <div className="relative min-h-screen bg-cosmic-gradient">
      <StarField />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <button onClick={() => navigate("/")} className="font-display text-xl text-primary">
          Innerverse
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm font-body text-muted-foreground hover:text-primary transition-colors"
        >
          내 우주 정원
        </button>
      </nav>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {phase === "write" && (
            <motion.div
              key="write"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h2 className="font-display text-3xl text-foreground mb-2">오늘 하루는 어땠나요?</h2>
                <p className="text-muted-foreground text-sm font-body">
                  {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                </p>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="오늘 있었던 일, 느낀 감정을 자유롭게 적어보세요..."
                className="w-full h-64 bg-card border border-border rounded-xl p-5 text-foreground font-body text-sm resize-none focus:outline-none focus:border-primary/50 focus:shadow-[0_0_20px_hsl(var(--cosmic-cyan)/0.1)] transition-all placeholder:text-muted-foreground/50"
              />

              <div className="flex justify-center">
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim()}
                  className="px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_30px_hsl(var(--cosmic-cyan)/0.4)] transition-all duration-300"
                >
                  🚀 우주로 전송하기
                </button>
              </div>
            </motion.div>
          )}

          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32 gap-6"
            >
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ borderTopColor: "hsl(var(--cosmic-cyan))" }} />
                <div className="absolute inset-2 rounded-full border-2 border-accent/30 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s", borderTopColor: "hsl(var(--nebula-purple))" }} />
              </div>
              <p className="text-muted-foreground font-body text-sm animate-pulse">
                당신의 내면을 분석하고 있습니다...
              </p>
            </motion.div>
          )}

          {phase === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h2 className="font-display text-3xl text-foreground mb-2">감정 분석 결과</h2>
                <p className="text-muted-foreground text-sm font-body">오늘 작성한 일기 기반 AI 감정 스펙트럼</p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-5 border-glow">
                {result.map((emotion, i) => (
                  <EmotionBar key={emotion.label} {...emotion} delay={i * 0.15} />
                ))}
              </div>

              <div className="bg-card/70 border border-border rounded-xl p-5 text-sm font-body text-muted-foreground leading-relaxed">
                {insight}
              </div>

              <div className="flex justify-center gap-4 pt-4">
                <button
                  onClick={() => { setText(""); setPhase("write"); }}
                  className="px-6 py-2.5 rounded-full border border-border text-muted-foreground font-body text-sm hover:border-primary/50 hover:text-foreground transition-all"
                >
                  다시 쓰기
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-body text-sm hover:shadow-[0_0_20px_hsl(var(--cosmic-cyan)/0.3)] transition-all"
                >
                  내 우주 정원 보기
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute top-1/3 -right-40 w-80 h-80 bg-cosmic-purple/8 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
};

export default Diary;
