// 상단 캡션 + 행성 이름 + 분기 배지 + 시점 리셋 버튼
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { resetPlanetRot } from "../sharedRefs";

export function TopBar() {
  const branch = useEmotionStore((s) => s.branch);
  const friendMode = useEmotionStore((s) => s.friendMode);
  const b = BRANCH[branch];

  const cap = friendMode ? "FRIEND VISIT" : "MY UNIVERSE";
  const title = friendMode ? "소연이의 행성과 교류 중" : "이음의 행성";

  return (
    <div className="iv-topbar">
      <div>
        <div className="iv-cap">{cap}</div>
        <h2>{title}</h2>
        <div className="iv-lvl">
          <span className="iv-lvlpill">{b.lvl}</span>
          <span>{b.ds}</span>
        </div>
      </div>
      <button
        className="iv-iconbtn"
        title="시점 초기화"
        aria-label="시점 초기화"
        onClick={() => resetPlanetRot()}
      >
        ⟲
      </button>
    </div>
  );
}
