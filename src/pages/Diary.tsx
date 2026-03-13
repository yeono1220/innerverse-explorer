import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Mic, Square, Send, Trash2 } from "lucide-react";
import StarField from "@/components/StarField";
import EmotionBar from "@/components/EmotionBar";

const MOCK_RESULT = [
  { label: "기쁨", value: 45, color: "hsl(45, 96%, 55%)" },
  { label: "슬픔", value: 15, color: "hsl(217, 91%, 60%)" },
  { label: "분노", value: 5, color: "hsl(348, 83%, 60%)" },
  { label: "불안", value: 20, color: "hsl(258, 58%, 58%)" },
  { label: "평온", value: 60, color: "hsl(187, 80%, 42%)" },
];

const MOCK_RELATIONSHIP = [
  { person: "김팀장", relation: "직장 동료", status: "스트레스 유발", score: -80 },
  { person: "지현이", relation: "친구", status: "위로가 됨", score: 60 },
];

const Diary = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"write" | "loading" | "result">("write");
  
  // 녹음 관련 상태 관리
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // 녹음 시작/종료 로직
  const toggleRecording = async () => {
    if (isRecording) {
      // 녹음 종료: onstop 이벤트가 발생하면서 Blob 파일이 생성됨
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // 녹음 시작
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        audioChunksRef.current = []; // 초기화

        // 마이크에 소리가 들어올 때마다 조각(chunk)을 배열에 저장
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        // 녹음이 끝나면 조각들을 모아서 하나의 webm 음성 파일로 압축
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          setAudioBlob(blob);
          
          // 녹음이 끝났으므로 마이크 권한 해제 (메모리 최적화)
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
        setAudioBlob(null); // 기존 녹음 파일 초기화
      } catch (err) {
        alert("마이크 사용 권한이 필요합니다.");
      }
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
  };

  // GCP 백엔드로 데이터 전송
  const handleSubmit = async () => {
    if (!text.trim() && !audioBlob) return;
    setPhase("loading");

    try {
      // 서버로 보낼 택배 상자(FormData) 포장
      const formData = new FormData();
      
      // 1. 음성 파일이 있으면 포장 (백엔드에서 Whisper로 텍스트/어조 추출)
      if (audioBlob) {
        formData.append("audio_file", audioBlob, "recording.webm");
      }
      
      // 2. 텍스트가 있으면 포장 (백엔드에서 KoELECTRA로 감정/관계망 분석)
      if (text.trim()) {
        formData.append("text_data", text);
      }

      /* // 🚨 [TODO: 연오님 GCP 서버 연결 시 주석 해제]
      // 여기서 Python FastAPI 서버로 쏩니다!
      const response = await fetch("https://연오님의-cloud-run-주소.run.app/api/analyze", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) throw new Error("서버 전송 실패");
      const resultData = await response.json();
      console.log("분석 완료:", resultData);
      */

      // (임시) 백엔드 연동 전까지는 2.5초 대기 후 MOCK 데이터 표시
      setTimeout(() => setPhase("result"), 2500);

    } catch (error) {
      console.error("API Error:", error);
      alert("우주로 전송하는 데 실패했습니다. 네트워크를 확인해주세요.");
      setPhase("write");
    }
  };

  return (
    <div className="relative min-h-screen bg-cosmic-gradient">
      <StarField />

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

              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="오늘 있었던 일, 느낀 감정을 적어보거나 마이크를 눌러 말씀해주세요..."
                  className={`w-full h-64 bg-card border rounded-xl p-5 text-foreground font-body text-sm resize-none focus:outline-none transition-all placeholder:text-muted-foreground/50 ${
                    isRecording 
                      ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]" 
                      : "border-border focus:border-primary/50 focus:shadow-[0_0_20px_hsl(var(--cosmic-cyan)/0.1)]"
                  }`}
                  disabled={isRecording}
                />
                
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 text-red-500 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs font-semibold">녹음 중...</span>
                  </div>
                )}

                {/* 녹음 완료된 파일이 있을 때 표시되는 UI */}
                {audioBlob && !isRecording && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-secondary/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-medium text-foreground">음성 파일 장전 완료</span>
                    <button onClick={deleteRecording} className="text-muted-foreground hover:text-red-500 ml-2 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={toggleRecording}
                  className={`flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${
                    isRecording 
                      ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.4)]" 
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={(!text.trim() && !audioBlob) || isRecording}
                  className="flex-1 flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_30px_hsl(var(--cosmic-cyan)/0.4)] transition-all duration-300"
                >
                  <Send size={18} />
                  우주로 전송하기
                </button>
              </div>
            </motion.div>
          )}

          {phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-32 gap-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ borderTopColor: "hsl(var(--cosmic-cyan))" }} />
                <div className="absolute inset-2 rounded-full border-2 border-accent/30 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s", borderTopColor: "hsl(var(--nebula-purple))" }} />
              </div>
              <p className="text-muted-foreground font-body text-sm animate-pulse">
                당신의 내면 파장을 분석하고 있습니다...
              </p>
            </motion.div>
          )}

          {phase === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="font-display text-3xl text-foreground mb-2">분석 결과</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-6 space-y-5 border-glow">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-4">내면 스펙트럼</h3>
                  {MOCK_RESULT.map((emotion, i) => (
                    <EmotionBar key={emotion.label} {...emotion} delay={i * 0.15} />
                  ))}
                </div>
                <div className="bg-card border border-border rounded-xl p-6 border-glow flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">인간관계 파장</h3>
                  {MOCK_RELATIONSHIP.map((rel, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + (idx * 0.2) }} className="p-4 rounded-lg bg-secondary/30 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground text-lg">{rel.person} <span className="text-xs font-normal text-muted-foreground ml-1">{rel.relation}</span></p>
                        <p className="text-sm text-muted-foreground mt-1">{rel.status}</p>
                      </div>
                      <div className={`w-3 h-3 rounded-full ${rel.score > 0 ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"}`} />
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => { setText(""); setAudioBlob(null); setPhase("write"); }} className="px-6 py-2.5 rounded-full border border-border text-muted-foreground font-body text-sm hover:border-primary/50 hover:text-foreground transition-all">
                  새로운 일기 쓰기
                </button>
                <button onClick={() => navigate("/dashboard")} className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-body text-sm hover:shadow-[0_0_20px_hsl(var(--cosmic-cyan)/0.3)] transition-all">
                  내 우주 정원 보기
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Diary;