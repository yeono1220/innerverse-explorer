// 폰 프레임 + Canvas + 모든 2D 오버레이를 합성하는 최상위 화면 컴포넌트.
import { useEffect, useState } from "react";
import { useEmotionStore } from "@/store/emotionStore";
import { useGrowthPreview, type GrowthStage } from "./growthStages";
import { Scene } from "./Scene";
import { StatusBar } from "./overlay/StatusBar";
import { TopBar } from "./overlay/TopBar";
import { EmotionMeter } from "./overlay/EmotionMeter";
import { SpeechBubble } from "./overlay/SpeechBubble";
import { OutcomeBanner } from "./overlay/OutcomeBanner";
import { ModeToggle } from "./overlay/ModeToggle";
import { EmotionDock } from "./overlay/EmotionDock";
import "./innerverse.css";

export function GlassMomoScene() {
  const [loaded, setLoaded] = useState(false);

  // 데모: 감정을 기록할 때마다 모모가 한 단계씩 성장 (0회 씨앗 → 6회 광휘).
  // burstTick은 감정 버튼(feed)에서만 증가하고 '대화하기'에선 안 올라간다.
  const burstTick = useEmotionStore((s) => s.burstTick);
  const setGrowthPreview = useGrowthPreview((s) => s.setPreview);
  useEffect(() => {
    setGrowthPreview(Math.min(7, 1 + burstTick) as GrowthStage);
  }, [burstTick, setGrowthPreview]);
  useEffect(() => () => setGrowthPreview(null), [setGrowthPreview]); // 화면 떠날 때 원복

  useEffect(() => {
    // 유리 셰이더 컴파일 시간을 살짝 가려주는 짧은 페이드아웃
    const t = window.setTimeout(() => setLoaded(true), 800);
    // R3F ResizeObserver가 absolute 컨테이너에서 초기 측정을 놓치는 케이스 보정
    const r = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(r);
    };
  }, []);

  return (
    <div className="iv-stage">
      <div className="iv-lead">
        <div className="iv-k">3D · GLASS MOMO · EMOTION EVOLUTION</div>
        <h1>감정이 모모를 빚는다</h1>
        <p>
          모모는 <b>유리</b>, 행성은 <b>결정면 디오라마</b>예요. 아래 감정 버튼으로 마음을 기록해보세요.{" "}
          <b>기록할수록 모모가 씨앗→광휘로 자라고</b>, 감정 비율에 따라{" "}
          <b>행성 색이 연속으로 바뀝니다</b>. 드래그로 돌려보세요.
        </p>
      </div>

      <div className="iv-phone">
        <div className="iv-notch" />
        <div className="iv-screen">
          <div className="iv-canvas-host">
            <Scene />
          </div>

          <div className={`iv-loading${loaded ? " hide" : ""}`}>
            <div className="iv-ring" />
            <div className="iv-t">유리 우주를 빚는 중…</div>
          </div>

          <div className="iv-overlay">
            <StatusBar />
            <TopBar />
            <EmotionMeter />
            <ModeToggle />
            <OutcomeBanner />
            <SpeechBubble />
            <EmotionDock />
          </div>
        </div>
      </div>
    </div>
  );
}
