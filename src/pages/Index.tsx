import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import StarField from "@/components/StarField";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-cosmic-gradient flex items-center justify-center overflow-hidden">
      <StarField />

      <div className="relative z-10 text-center px-6 max-w-2xl">
        <motion.p
          className="text-sm tracking-[0.3em] uppercase text-primary font-body mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          감정의 우주로 떠나는 여행
        </motion.p>

        <motion.h1
          className="font-display text-5xl md:text-7xl font-light text-foreground leading-tight mb-4 text-glow-cyan"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          당신의 내면을
          <br />
          탐험하세요
        </motion.h1>

        <motion.p
          className="font-display text-3xl md:text-4xl italic text-primary mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Innerverse
        </motion.p>

        <motion.p
          className="text-muted-foreground font-body text-base mb-12 max-w-md mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          매일의 감정을 기록하고, AI가 당신의 내면 우주를 분석합니다
        </motion.p>

        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.1 }}
        >
          <button
            onClick={() => navigate("/diary")}
            className="flex items-center gap-3 px-8 py-3.5 rounded-full bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_hsl(var(--cosmic-cyan)/0.2)] group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                className="text-cosmic-blue"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                className="text-green-400"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                className="text-cosmic-gold"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                className="text-destructive"
              />
            </svg>
            <span className="text-foreground font-body text-sm group-hover:text-primary transition-colors">
              Google로 시작하기
            </span>
          </button>

          <button
            onClick={() => navigate("/diary")}
            className="text-muted-foreground text-sm font-body hover:text-primary transition-colors"
          >
            둘러보기 →
          </button>
        </motion.div>
      </div>

      {/* Subtle cosmic nebula glow */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cosmic-purple/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
};

export default Index;
