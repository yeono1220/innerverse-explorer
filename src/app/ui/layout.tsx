// 폰 프레임 + 상태바 + 앱바 + 탭바 + 아이콘 버튼 (모든 화면 공유)
import { ReactNode } from "react";
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

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const lead = PAGE_LEAD[pathname];
  return (
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
