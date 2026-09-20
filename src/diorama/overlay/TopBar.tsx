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

  // 뒤로 버튼(왼쪽) · 문구(가운데) · 빈 칸(오른쪽) 3칸 그리드.
  // .iv-topbar 는 glass-momo / pitch 화면도 함께 쓰므로 공용 규칙은 건드리지 않고
  // --centered 수정자만 얹는다 (diorama.css).
  return (
    <div className="iv-topbar iv-topbar--centered">
      {/* 시각 순서와 탭 순서가 어긋나지 않도록 DOM 에서도 버튼을 먼저 둔다 */}
      <button className="iv-iconbtn" onClick={() => nav(-1)} aria-label="뒤로">
        ←
      </button>

      <div className="iv-topbar-title">
        <div className="iv-cap">MY ASTEROID</div>
        <h2>{planetName}</h2>
        {/* <div className="iv-lvl">
          <span className="iv-lvlpill">{b.lvl}</span>
          <span>구조물 {count}개 · {b.ds}</span>
        </div> */}
      </div>

      {/* 문구를 '남은 공간의 가운데'가 아니라 화면 정중앙에 두기 위한
          버튼과 같은 폭의 빈 칸. 읽히면 안 되므로 aria-hidden. */}
      <div aria-hidden="true" />
    </div>
  );
}
