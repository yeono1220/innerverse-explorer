// 24 · 설정 (알림 토글 + 테마 + 계정 + 회원 탈퇴)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Toggle } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { useUserStore } from "@/store/userStore";
import { useAppStore } from "@/store/appStore";
import { LevelBar } from "../ui/LevelBar";
import { PLAN_LABEL, PLUS_PRICE_WON } from "@/lib/plan";
import { clearAndLeave } from "@/store/session";
import { isSupabaseConfigured } from "@/lib/supabase";

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
  const settings = useAppStore((s) => s.settings);
  const setSetting = useAppStore((s) => s.setSetting);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveInput, setLeaveInput] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);

  // 로그아웃: 세션 종료 + 이 기기에 남은 개인 데이터 삭제 후 전체 새로고침.
  const onLogout = async () => {
    try {
      const { signOut } = await import("@/services/auth");
      await signOut();
    } catch {
      /* 무시 */
    }
    clearAndLeave("/login");
  };

  // 회원 탈퇴: DB의 계정·데이터 전체 삭제 → 세션 종료 → 로컬 데이터 삭제.
  const onDeleteAccount = async () => {
    setLeaveErr(null);
    setLeaveBusy(true);
    try {
      const { deleteOwnAccount } = await import("@/services/auth");
      await deleteOwnAccount();
      clearAndLeave("/login");
    } catch (e) {
      const msg = (e as Error)?.message || "";
      setLeaveErr(
        /function .*delete_own_account.*does not exist|schema cache/i.test(msg)
          ? "탈퇴 기능이 아직 서버에 적용되지 않았어요. (0010_account_delete.sql 실행 필요)"
          : "탈퇴 처리에 실패했어요: " + msg,
      );
      setLeaveBusy(false);
    }
  };

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
                별조각 ✦{user.stardust} · {PLAN_LABEL[user.plan]}
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
          <div style={{ marginTop: 14 }}>
            <LevelBar compact />
          </div>
        </Card>

        <Card onClick={() => nav("/plan")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 24 }}>{user.plan === "plus" ? "💎" : "✦"}</div>
            <div style={{ flex: 1 }}>
              <div className="iv-card-title">플랜 & 별조각</div>
              <div className="iv-card-sub">
                {user.plan === "plus"
                  ? "플러스 이용 중 · 무제한 대화"
                  : user.mileageUse === "discount"
                  ? `할인 ${user.discountWon.toLocaleString("ko-KR")}원 적립 · 플러스 월 ${PLUS_PRICE_WON.toLocaleString("ko-KR")}원`
                  : "별조각이 성장에 쌓이는 중"}
              </div>
            </div>
            <div style={{ color: "var(--iv-purple2)", fontSize: 18 }}>›</div>
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
            onClick={onLogout}
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

          {isSupabaseConfigured && !confirmLeave && (
            <button
              onClick={() => {
                setConfirmLeave(true);
                setLeaveInput("");
                setLeaveErr(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--iv-txt3)",
                fontSize: 12.5,
                padding: "10px 4px 2px",
                cursor: "pointer",
                textAlign: "left",
                textDecoration: "underline",
              }}
            >
              회원 탈퇴
            </button>
          )}

          {isSupabaseConfigured && confirmLeave && (
            <div
              style={{
                marginTop: 10,
                padding: 14,
                borderRadius: 12,
                border: "1px solid rgba(232,116,78,.35)",
                background: "rgba(232,116,78,.07)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--iv-emo-anger)" }}>
                정말 탈퇴하시겠어요?
              </div>
              <div style={{ fontSize: 12, color: "var(--iv-txt2)", lineHeight: 1.6 }}>
                계정과 함께 일기·감정 기록·모모와의 대화·행성 성장까지 <b>전부 즉시 삭제</b>되고,
                복구할 수 없어요. 계속하려면 아래에 <b>탈퇴</b> 를 입력해 주세요.
              </div>
              <input
                className="iv-input"
                value={leaveInput}
                onChange={(e) => setLeaveInput(e.target.value)}
                placeholder="탈퇴"
                aria-label="탈퇴 확인 입력"
                disabled={leaveBusy}
              />
              {leaveErr && (
                <div style={{ fontSize: 11.5, color: "var(--iv-emo-anger)" }}>{leaveErr}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onDeleteAccount}
                  disabled={leaveInput.trim() !== "탈퇴" || leaveBusy}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 10,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    background: "var(--iv-emo-anger)",
                    opacity: leaveInput.trim() !== "탈퇴" || leaveBusy ? 0.45 : 1,
                    cursor: leaveInput.trim() !== "탈퇴" || leaveBusy ? "default" : "pointer",
                  }}
                >
                  {leaveBusy ? "삭제 중…" : "탈퇴하고 모두 삭제"}
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  disabled={leaveBusy}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 10,
                    border: "1px solid var(--iv-line)",
                    background: "none",
                    color: "var(--iv-txt2)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </Card>
      </Body>
    </>
  );
}
