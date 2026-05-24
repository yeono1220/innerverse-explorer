// 폰 프레임 + Canvas + 모든 2D 오버레이를 합성하는 최상위 화면 컴포넌트.
import { useEffect, useState } from "react";
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
          모모와 행성은 <b>유리 질감</b>이에요. 아래 감정 버튼으로 마음을 쌓아보세요.{" "}
          <b>긍정이 쌓이면 씨앗→숲으로 피어나고</b>, 부정·공허가 쌓이면{" "}
          <b>전혀 다른 행성</b>으로 갈라집니다. 드래그로 돌려보세요.
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
