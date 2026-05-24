// 우상단 감정 누적 미터 (긍정/긴장/슬픔/공허)
import { useEmotionStore } from "@/store/emotionStore";

function cap(v: number) {
  return Math.min(100, Math.round(v));
}

export function EmotionMeter() {
  const emo = useEmotionStore((s) => s.emo);
  const rows: Array<{ k: string; color: string; val: number }> = [
    { k: "pos", color: "var(--iv-green)", val: cap(emo.pos + emo.calm) },
    { k: "ten", color: "var(--iv-amber)", val: cap(emo.ten) },
    { k: "sad", color: "var(--iv-sad)", val: cap(emo.sad) },
    { k: "emp", color: "var(--iv-empty)", val: cap(emo.emp) },
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
