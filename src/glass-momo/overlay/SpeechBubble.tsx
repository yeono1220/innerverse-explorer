// 모모 말풍선. speechTick이 바뀌면 2.6초 후 자동 페이드 아웃.
import { useEffect, useState } from "react";
import { useEmotionStore } from "@/store/emotionStore";

export function SpeechBubble() {
  const speech = useEmotionStore((s) => s.speech);
  const speechTick = useEmotionStore((s) => s.speechTick);
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 2600);
    return () => window.clearTimeout(t);
  }, [speechTick]);

  return <div className={`iv-speech${on ? " on" : ""}`}>{speech}</div>;
}
