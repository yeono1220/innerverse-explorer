// 24 · 설정 (알림 토글 + 테마 + 계정)
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Toggle } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { useUserStore } from "@/store/userStore";
import { useAppStore } from "@/store/appStore";

function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: "var(--iv-txt)", fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export default function Settings() {
  const nav = useNavigate();
  const user = useUserStore();
  const logout = useUserStore((s) => s.logout);
  const settings = useAppStore((s) => s.settings);
  const setSetting = useAppStore((s) => s.setSetting);

  return (
    <>
      <StatusBar />
      <AppBar title="나의 우주" />
      <Body tabbed>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Planet2D color={user.planetColor} size={70} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{user.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--iv-txt2)", marginTop: 2 }}>
                {user.planetCode} · Lv.{user.level}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--iv-purple2)", marginTop: 2 }}>
                별조각 {user.stardust}개 보유
              </div>
            </div>
            <button
              className="iv-iconbtn"
              onClick={() => nav("/signup")}
              aria-label="프로필 수정"
            >
              ✎
            </button>
          </div>
        </Card>

        <Card>
          <div className="iv-section-h" style={{ marginBottom: 0 }}>알림</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Row
              label="앱 알림"
              sub="중요한 활동을 푸시로"
              right={<Toggle on={settings.notifPush} onChange={(v) => setSetting("notifPush", v)} />}
            />
            <Row
              label="과거의 편지"
              sub="기념일 도착 알림"
              right={<Toggle on={settings.notifLetter} onChange={(v) => setSetting("notifLetter", v)} />}
            />
            <Row
              label="친구 활동"
              sub="친구의 방문/감정 변화"
              right={<Toggle on={settings.notifFriend} onChange={(v) => setSetting("notifFriend", v)} />}
            />
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">바로가기</div>
          {[
            { label: "모모의 기억", to: "/memory", emoji: "🧠" },
            { label: "친구 찾기", to: "/friend/add", emoji: "👥" },
            { label: "은하수 보기", to: "/galaxy", emoji: "🌌" },
            { label: "인벤토리", to: "/inventory", emoji: "🎁" },
            { label: "5분기 진화 갤러리", to: "/branches", emoji: "🌳" },
            { label: "3D 글래스 모드", to: "/glass", emoji: "💎" },
          ].map((it) => (
            <button
              key={it.to}
              onClick={() => nav(it.to)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--iv-txt)",
                fontSize: 13.5,
                fontWeight: 600,
                width: "100%",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18 }}>{it.emoji}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              <span style={{ color: "var(--iv-txt3)" }}>›</span>
            </button>
          ))}
        </Card>

        <Card>
          <div className="iv-section-h">계정</div>
          {[
            "이용약관",
            "개인정보처리방침",
            "오픈소스 라이선스",
            "버전 0.0.1",
          ].map((s) => (
            <div
              key={s}
              style={{
                padding: "12px 4px",
                fontSize: 13.5,
                color: "var(--iv-txt2)",
              }}
            >
              {s}
            </div>
          ))}
          <button
            onClick={async () => {
              try {
                const { signOut } = await import("@/services/auth");
                await signOut();
              } catch {
                /* 무시 */
              }
              logout();
              nav("/login", { replace: true });
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--iv-emo-anger)",
              fontSize: 13.5,
              fontWeight: 600,
              padding: "12px 4px",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            로그아웃
          </button>
        </Card>
      </Body>
    </>
  );
}
