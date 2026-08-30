// 우상단 감정 누적 미터 — 5감정 (고양/평온/긴장/격앙/침체)
import { useEmotionStore } from "@/pitch/store/emotionStore";

function cap(v: number) {
  return Math.min(100, Math.round(v));
}

export function EmotionMeter() {
  const emo = useEmotionStore((s) => s.emo);
  const rows: Array<{ k: string; color: string; val: number }> = [
    { k: "고양", color: "#3ec074", val: cap(emo.pos) },
    { k: "평온", color: "#46a6e6", val: cap(emo.calm) },
    { k: "긴장", color: "#d99a4e", val: cap(emo.ten) },
    { k: "격앙", color: "#e0574e", val: cap(emo.sad) },
    { k: "침체", color: "#9090c8", val: cap(emo.emp) },
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
