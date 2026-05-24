// 분기 결과 배너. 감정을 먹일 때마다 표시되고 2.4초 후 자동 숨김.
import { useEffect, useState } from "react";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";

export function OutcomeBanner() {
  const outcomeTick = useEmotionStore((s) => s.outcomeTick);
  const branch = useEmotionStore((s) => s.branch);
  const [show, setShow] = useState(false);
  const b = BRANCH[branch];

  useEffect(() => {
    if (outcomeTick === 0) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2400);
    return () => window.clearTimeout(t);
  }, [outcomeTick]);

  return (
    <div className={`iv-outcome${show ? " on" : ""}`} aria-live="polite">
      <div className="iv-nm">{b.nm}</div>
      <div className="iv-ds">{b.ds}</div>
    </div>
  );
}
