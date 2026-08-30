// 우상단 감정 누적 미터 (7감정)
import { useEmotionStore } from "@/store/emotionStore";

function cap(v: number) {
  return Math.min(100, Math.round(v));
}

export function EmotionMeter() {
  const emo = useEmotionStore((s) => s.emo);
  const rows: Array<{ k: string; color: string; val: number }> = [
    { k: "기쁨", color: "var(--iv-emo-joy)", val: cap(emo.joy) },
    { k: "차분", color: "var(--iv-emo-calm)", val: cap(emo.calm) },
    { k: "사랑", color: "var(--iv-emo-love)", val: cap(emo.love) },
    { k: "슬픔", color: "var(--iv-emo-sad)", val: cap(emo.sad) },
    { k: "분노", color: "var(--iv-emo-anger)", val: cap(emo.anger) },
    { k: "긴장", color: "var(--iv-emo-tension)", val: cap(emo.tension) },
    { k: "공허", color: "var(--iv-emo-empty)", val: cap(emo.empty) },
  ];
  return (
    <div className="iv-meter" aria-label="감정 누적">
      <div className="iv-h">감정 누적</div>
      {rows.map((r) => (
        <div className="iv-row" key={r.k}>
          <span className="iv-d" style={{ background: r.color }} />
          <span className="iv-t">
            <i style={{ width: `${r.val}%`, background: r.color }} />
          </span>
          <span className="iv-v">{r.val}</span>
        </div>
      ))}
    </div>
  );
}
