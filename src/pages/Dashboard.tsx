import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import StarField from "@/components/StarField";
import EmotionCalendar from "@/components/EmotionCalendar";
import WeeklyChart from "@/components/WeeklyChart";

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-cosmic-gradient">
      <StarField />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <button onClick={() => navigate("/")} className="font-display text-xl text-primary">
          Innerverse
        </button>
        <button
          onClick={() => navigate("/diary")}
          className="px-5 py-2 rounded-full border border-border text-sm font-body text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all"
        >
          + 오늘의 기록
        </button>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="font-display text-4xl text-foreground mb-2">나의 우주 정원</h1>
          <p className="text-muted-foreground font-body text-sm">감정의 궤적을 한눈에 살펴보세요</p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <EmotionCalendar />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <WeeklyChart />
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
};

export default Dashboard;
