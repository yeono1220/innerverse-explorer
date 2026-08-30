// 하단 도크: 감정 7버튼 + 대화/친구 액션 + 리셋 텍스트버튼.
import { useEmotionStore, type Emo7 } from "@/store/emotionStore";

type Feed = { key: Emo7; emoji: string; label: string; group: "pos" | "neg" };

const FEEDS: Feed[] = [
  { key: "joy", emoji: "😊", label: "기쁨", group: "pos" },
  { key: "calm", emoji: "🌿", label: "차분", group: "pos" },
  { key: "love", emoji: "💗", label: "사랑", group: "pos" },
  { key: "sad", emoji: "🥲", label: "슬픔", group: "neg" },
  { key: "anger", emoji: "😠", label: "분노", group: "neg" },
  { key: "tension", emoji: "😰", label: "긴장", group: "neg" },
  { key: "empty", emoji: "🌫️", label: "공허", group: "neg" },
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
            className={`iv-fb ${f.group}`}
            onClick={() => feed(f.key)}
            aria-label={`감정 ${f.label}`}
          >
            <span className="iv-e" aria-hidden="true">
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
