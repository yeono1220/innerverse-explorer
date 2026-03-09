import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const data = [
  { day: "월", joy: 60, sadness: 20, anger: 5, anxiety: 30, peace: 45 },
  { day: "화", joy: 45, sadness: 35, anger: 10, anxiety: 40, peace: 30 },
  { day: "수", joy: 70, sadness: 10, anger: 5, anxiety: 15, peace: 65 },
  { day: "목", joy: 30, sadness: 50, anger: 25, anxiety: 55, peace: 20 },
  { day: "금", joy: 55, sadness: 25, anger: 15, anxiety: 35, peace: 50 },
  { day: "토", joy: 80, sadness: 10, anger: 5, anxiety: 10, peace: 75 },
  { day: "일", joy: 65, sadness: 20, anger: 10, anxiety: 25, peace: 60 },
];

const lines = [
  { key: "joy", color: "hsl(45, 96%, 55%)", label: "기쁨" },
  { key: "sadness", color: "hsl(217, 91%, 60%)", label: "슬픔" },
  { key: "anger", color: "hsl(348, 83%, 60%)", label: "분노" },
  { key: "anxiety", color: "hsl(258, 58%, 58%)", label: "불안" },
  { key: "peace", color: "hsl(187, 80%, 42%)", label: "평온" },
];

const WeeklyChart = () => {
  return (
    <div className="rounded-xl bg-card p-6 border border-border border-glow">
      <h3 className="font-display text-xl text-foreground mb-6">주간 감정 추이</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 25%, 18%)" />
          <XAxis dataKey="day" stroke="hsl(215, 20%, 55%)" fontSize={12} />
          <YAxis stroke="hsl(215, 20%, 55%)" fontSize={12} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(225, 40%, 9%)",
              border: "1px solid hsl(225, 25%, 18%)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={2}
              dot={{ r: 3, fill: l.color }}
              name={l.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-4">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-muted-foreground font-body">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyChart;
