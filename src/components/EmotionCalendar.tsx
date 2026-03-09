import { useMemo } from "react";

const EMOTION_COLORS: Record<string, string> = {
  joy: "hsl(45, 96%, 55%)",
  sadness: "hsl(217, 91%, 60%)",
  anger: "hsl(348, 83%, 60%)",
  anxiety: "hsl(258, 58%, 58%)",
  peace: "hsl(187, 80%, 42%)",
};

const EMOTION_LABELS: Record<string, string> = {
  joy: "기쁨",
  sadness: "슬픔",
  anger: "분노",
  anxiety: "불안",
  peace: "평온",
};

const EmotionCalendar = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const emotionData = useMemo(() => {
    const emotions = ["joy", "sadness", "anger", "anxiety", "peace"];
    const data: Record<number, string> = {};
    for (let d = 1; d <= today.getDate(); d++) {
      data[d] = emotions[Math.floor(Math.random() * emotions.length)];
    }
    return data;
  }, []);

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const monthName = `${year}년 ${month + 1}월`;

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const emotion = emotionData[d];
    const isToday = d === today.getDate();
    cells.push(
      <div key={d} className="flex flex-col items-center gap-1 py-1">
        <span className={`text-xs font-body ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
          {d}
        </span>
        {emotion ? (
          <div
            className="w-5 h-5 rounded-full"
            style={{ backgroundColor: EMOTION_COLORS[emotion], boxShadow: `0 0 8px ${EMOTION_COLORS[emotion]}44` }}
            title={EMOTION_LABELS[emotion]}
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-secondary" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-6 border border-border border-glow">
      <h3 className="font-display text-xl text-foreground mb-4">{monthName}</h3>
      <div className="grid grid-cols-7 gap-2 mb-2">
        {dayNames.map((name) => (
          <div key={name} className="text-center text-xs text-muted-foreground font-body">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">{cells}</div>
      <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-border">
        {Object.entries(EMOTION_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[key] }} />
            <span className="text-xs text-muted-foreground font-body">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmotionCalendar;
