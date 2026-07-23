// 하단 도크: 감정 5버튼 + 대화/친구 액션 + 리셋 텍스트버튼.
import { useEmotionStore, type EmoKey } from "@/pitch/store/emotionStore";

type Feed = { key: EmoKey; emoji: string; label: string; en: string; color: string };

// Russell 순환모형 5감정 (고양/평온/긴장/격앙/침체)
const FEEDS: Feed[] = [
  { key: "pos", emoji: "🤩", label: "고양", en: "Elated", color: "#3ec074" },
  { key: "calm", emoji: "😌", label: "평온", en: "Serene", color: "#46a6e6" },
  { key: "ten", emoji: "😬", label: "긴장", en: "Tense", color: "#d99a4e" },
  { key: "sad", emoji: "😠", label: "격앙", en: "Agitated", color: "#e0574e" },
  { key: "emp", emoji: "😞", label: "침체", en: "Depressed", color: "#9090c8" },
];

export function EmotionDock() {
  const feed = useEmotionStore((s) => s.feed);
  const talk = useEmotionStore((s) => s.talk);
  const toggleFriend = useEmotionStore((s) => s.toggleFriend);
  const reset = useEmotionStore((s) => s.reset);
  const friendMode = useEmotionStore((s) => s.friendMode);

  return (
    <div className="iv-dock">
      <div className="iv-feedlabel">감정을 들려주면 모모가 그 마음을 흡수해요</div>
      <div className="iv-feed">
        {FEEDS.map((f) => (
          <button
            key={f.key}
            className="iv-fb"
            style={{ boxShadow: `inset 0 0 0 1px ${f.color}55`, color: "#fff" }}
            onClick={() => feed(f.key)}
            aria-label={`감정 ${f.label} (${f.en})`}
            title={f.en}
          >
            <span className="iv-e" aria-hidden="true" style={{ color: f.color }}>
              {f.emoji}
            </span>
            {f.label}
          </button>
        ))}
      </div>
      <div className="iv-actions">
        <button className="iv-act" onClick={talk}>
          💬 대화하기
        </button>
        <button className="iv-act primary" onClick={() => toggleFriend()}>
          {friendMode ? "🏠 내 행성으로" : "🪐 친구 모드"}
        </button>
      </div>
      <div className="iv-reset">
        <button className="iv-resetbtn" onClick={reset}>
          처음부터 (감정 비우기)
        </button>
      </div>
    </div>
  );
}
