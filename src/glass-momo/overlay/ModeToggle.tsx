// 친구 모드 전환 시 상단 가운데 등장하는 토글 (나의 행성 ↔ 친구와 교류).
// 한 번이라도 친구 모드를 켰다면 계속 노출.
import { useState, useEffect } from "react";
import { useEmotionStore } from "@/store/emotionStore";

export function ModeToggle() {
  const friendMode = useEmotionStore((s) => s.friendMode);
  const toggleFriend = useEmotionStore((s) => s.toggleFriend);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (friendMode) setShown(true);
  }, [friendMode]);

  return (
    <div className={`iv-modeToggle${shown ? " show" : ""}`}>
      <button
        className={!friendMode ? "on" : ""}
        onClick={() => toggleFriend(false)}
        aria-pressed={!friendMode}
      >
        나의 행성
      </button>
      <button
        className={friendMode ? "on" : ""}
        onClick={() => toggleFriend(true)}
        aria-pressed={friendMode}
      >
        친구와 교류
      </button>
    </div>
  );
}
