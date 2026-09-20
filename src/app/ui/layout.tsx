// 폰 프레임 + 상태바 + 앱바 + 탭바 + 아이콘 버튼 (모든 화면 공유)
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// 폰 위(스테이지)에 띄우는 리드 문구. 경로별로 정의 — 정의된 화면에서만 노출된다.
const PAGE_LEAD: Record<string, { k: string; h1: string; p: string }> = {
  "/home": {
    k: "HOME",
    h1: "2026 AI CHAMPIONSHIP",
    p: "일주일의 목업 데이터가 기본으로 제공되어있습니다",
  },
  "/diary": {
    k: "DIARY",
    h1: "이미 기록해둔 감정,\n언제든 다시 꺼내볼 수 있어요",
    p: "지난날의 마음을 천천히, 편하게 다시 들여다봐요.",
  },
};

type PageLead = { k: string; h1: string; p: string };
const PageLeadContext = createContext<{
  setLead: (lead: PageLead | null) => void;
}>({ setLead: () => undefined });

/**
 * 이 화면의 리드 문구를 폰 위(스테이지)에 띄운다.
 *
 * 객체가 아니라 '값'으로 비교한다. 객체 그대로를 의존성에 두면
 * usePageLead({ ... }) 처럼 인라인으로 넘긴 화면이 매 렌더마다 새 객체를 만들어
 * effect 재실행 → setState → 재렌더 가 무한히 도는 사고가 난다.
 * (useMemo 로 감싸야만 안전한 API 는 언젠가 반드시 누가 밟는다.)
 */
export function usePageLead(lead: PageLead | null) {
  const { setLead } = useContext(PageLeadContext);
  const k = lead?.k;
  const h1 = lead?.h1;
  const p = lead?.p;
  useEffect(() => {
    setLead(k === undefined ? null : { k, h1: h1 ?? "", p: p ?? "" });
    return () => setLead(null);
  }, [k, h1, p, setLead]);
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  // 화면이 usePageLead 로 직접 지정한 리드. 없으면 null.
  const [screenLead, setScreenLead] = useState<PageLead | null>(null);

  // ⚠️ 예전에는 pathname 이 바뀔 때 useEffect 로 리드를 덮어썼는데,
  //    React 는 자식 effect 를 부모보다 먼저 실행한다. 그래서 화면이
  //    usePageLead 로 넣은 값을 부모 effect 가 곧바로 null 로 지워버렸다
  //    (= WeeklyReview 가 리드를 넣는데도 화면에 안 뜨던 원인).
  //    경로 기본값은 effect 없이 렌더 중에 계산하고, 화면이 지정한 값을 우선한다.
  const lead = screenLead ?? PAGE_LEAD[pathname] ?? null;

  // context 값도 고정한다. 매 렌더마다 새 객체면 소비자의 effect 가 매번 다시 돈다.
  const ctx = useMemo(() => ({ setLead: setScreenLead }), []);

  return (
    <PageLeadContext.Provider value={ctx}>
      <div className="iv-page">
        {lead && (
          <div className="iv-page-lead">
            <div className="iv-k">{lead.k}</div>
            <h1 style={{ whiteSpace: "pre-line" }}>{lead.h1}</h1>
            <p>{lead.p}</p>
          </div>
        )}
        <div className="iv-phone">
          <div className="iv-phone-notch" />
          <div className="iv-phone-screen">{children}</div>
        </div>
      </div>
    </PageLeadContext.Provider>
  );
}

export function StatusBar() {
  return (
    <div className="iv-sb">
      <span>9:41</span>
      <span className="iv-sb-r">●●● ⊿ ▦</span>
    </div>
  );
}

export function IconButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button className="iv-iconbtn" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

interface AppBarProps {
  title?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  left?: ReactNode;
}

// 좌측 (back 또는 left) / 중앙 타이틀 / 우측 액션. 비대칭 보정을 위해 좌우 슬롯 폭은 항상 동일.
export function AppBar({ title, back, right, left }: AppBarProps) {
  const nav = useNavigate();
  const onBack = () => {
    if (typeof back === "function") return back();
    nav(-1);
  };
  return (
    <div className="iv-appbar">
      <div className="iv-appbar-side">
        {left ??
          (back ? (
            <IconButton onClick={onBack} ariaLabel="뒤로">
              ←
            </IconButton>
          ) : null)}
      </div>
      {title ? <h1>{title}</h1> : <div style={{ flex: 1 }} />}
      <div className="iv-appbar-side">{right ?? null}</div>
    </div>
  );
}

const TABS: Array<{ path: string; icon: string; label: string }> = [
  { path: "/home", icon: "🪐", label: "행성" },
  { path: "/diary", icon: "📖", label: "목록" },
  { path: "/review", icon: "✦", label: "리뷰" },
  { path: "/me", icon: "👤", label: "나" },
];

export function TabBar() {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <nav className="iv-tabbar" aria-label="주 메뉴">
      {TABS.map((t) => {
        const on = loc.pathname === t.path;
        return (
          <button
            key={t.path}
            className={`iv-tab${on ? " on" : ""}`}
            onClick={() => nav(t.path)}
            aria-current={on ? "page" : undefined}
          >
            <span className="iv-tab-icon" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// 스크롤 가능한 본문. tabbed=true면 TabBar 영역만큼 하단 여백 확보.
export function Body({ children, tabbed }: { children: ReactNode; tabbed?: boolean }) {
  return <div className={`iv-body${tabbed ? " iv-body--tabbed" : ""}`}>{children}</div>;
}
