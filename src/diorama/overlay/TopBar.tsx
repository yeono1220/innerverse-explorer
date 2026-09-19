// 상단 캡션 + 행성 이름 + 분기 배지 + 구조물 개수 + 뒤로
import { useNavigate } from "react-router-dom";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { useDiaryStore } from "@/store/diaryStore";
import { useUserStore } from "@/store/userStore";

export function TopBar() {
  const nav = useNavigate();
  const branch = useEmotionStore((s) => s.branch);
  const b = BRANCH[branch];
  const count = useDiaryStore((s) => s.entries.length);
  const planetName = useUserStore((s) => s.planetName);

  return (
    <div className="iv-topbar">
      <div>
        <div className="iv-cap">MY ASTEROID</div>
        <h2>{planetName}</h2>
        {/* <div className="iv-lvl">
          <span className="iv-lvlpill">{b.lvl}</span>
          <span>구조물 {count}개 · {b.ds}</span>
        </div> */}
      </div>
      <button className="iv-iconbtn" onClick={() => nav(-1)} aria-label="뒤로">
        ←
      </button>
    </div>
  );
}
