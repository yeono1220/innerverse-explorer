import { motion } from "framer-motion";

interface EmotionBarProps {
  label: string;
  value: number;
  color: string;
  delay?: number;
}

const EmotionBar = ({ label, value, color, delay = 0 }: EmotionBarProps) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-body">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-3 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.2, delay, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};

export default EmotionBar;
