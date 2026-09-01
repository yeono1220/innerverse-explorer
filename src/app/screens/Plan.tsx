// 25 · 플랜 & 별조각 (무료/플러스 구분 + 별조각 사용처 선택 + 구독 할인 교환)
import { useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, CapLabel, Button } from "../ui/primitives";
import { LevelBar } from "../ui/LevelBar";
import { useUserStore } from "@/store/userStore";
import { useUsageStore } from "@/store/usageStore";
import { PLAN_LIMITS, PLUS_PRICE_WON, isUnlimited } from "@/lib/plan";
import { DISCOUNT_STEP, DISCOUNT_CAP_WON, WON_PER_MILEAGE, mileageForNextLevel } from "@/lib/level";

const won = (n: number) => n.toLocaleString("ko-KR");

function Bullet({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5, padding: "3px 0" }}>
      <span style={{ color: ok ? "#7fd8a6" : "var(--iv-txt3)", flex: "0 0 auto" }}>{ok ? "✓" : "—"}</span>
      <span style={{ color: ok ? "var(--iv-txt)" : "var(--iv-txt3)" }}>{children}</span>
    </div>
  );
}

export default function Plan() {
  const user = useUserStore();
  const setPlan = useUserStore((s) => s.setPlan);
  const setMileageUse = useUserStore((s) => s.setMileageUse);
  const redeemMileage = useUserStore((s) => s.redeemMileage);
  const chatTurns = useUsageStore((s) => s.chatTurns);
  const diaryCount = useUsageStore((s) => s.diaryCount);
  const chatLeft = Math.max(0, PLAN_LIMITS[user.plan].chatTurnsPerDay - chatTurns);
  const diaryLeft = Math.max(0, PLAN_LIMITS[user.plan].diaryPerWeek - diaryCount);
  const [msg, setMsg] = useState("");

  const free = user.plan === "free";
  const netPrice = Math.max(0, PLUS_PRICE_WON - user.discountWon);

  const onRedeem = () => {
    const spent = redeemMileage(DISCOUNT_STEP);
    setMsg(
      spent > 0
        ? `${spent} 별조각을 ${won(spent * WON_PER_MILEAGE)}원 할인으로 바꿨어요.`
        : `${DISCOUNT_STEP} 별조각 이상 있어야 하고, 월 ${won(DISCOUNT_CAP_WON)}원까지만 교환할 수 있어요.`,
    );
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="플랜 & 별조각" />
      <Body>
        <div style={{ textAlign: "center" }}>
          <CapLabel>{free ? "FREE PLAN" : "INNERVERSE PLUS"}</CapLabel>
          <h2 style={{ fontSize: 21, fontWeight: 800, marginTop: 6 }}>
            {free ? "무료로 쓰는 중" : "플러스 이용 중"}
          </h2>
          <p style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 4 }}>
            보유 별조각 ✦ {user.stardust} · 누적 {user.mileageEarned}
          </p>
        </div>

        <Card>
          <div className="iv-section-h">나의 성장</div>
          <LevelBar />
          <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 8, lineHeight: 1.5 }}>
            일일 퀘스트와 출석으로 받은 별조각이 성장에 쌓여요. 이번 레벨은 {mileageForNextLevel(user.level)} 별조각 구간이고,
            레벨이 오를 때마다 인벤토리에 데코가 하나씩 늘어나요.
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">별조각을 어디에 쓸까요?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([
              { key: "level" as const, emoji: "🌱", title: "성장(레벨업)", sub: "받는 즉시 레벨에 투자 · 레벨업마다 데코 1종" },
              { key: "discount" as const, emoji: "🎟️", title: "구독 할인", sub: "잔액으로 모아 할인·아이템 구매" },
            ]).map((o) => {
              const on = user.mileageUse === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    setMileageUse(o.key);
                    setMsg(o.key === "level" ? "이제 별조각이 성장에 쌓여요." : "이제 별조각을 모아 할인으로 바꿀 수 있어요.");
                  }}
                  style={{
                    textAlign: "left",
                    padding: "12px 12px",
                    borderRadius: 14,
                    cursor: "pointer",
                    color: "var(--iv-txt)",
                    background: on ? "linear-gradient(135deg,rgba(124,111,232,.3),rgba(163,148,247,.16))" : "rgba(255,255,255,.04)",
                    border: on ? "1px solid rgba(163,148,247,.6)" : "1px solid var(--iv-line)",
                  }}
                >
                  <div style={{ fontSize: 18 }}>{o.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{o.title}</div>
                  <div style={{ fontSize: 11, color: "var(--iv-txt3)", marginTop: 2 }}>{o.sub}</div>
                </button>
              );
            })}
          </div>
          {user.mileageUse === "discount" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, color: "var(--iv-txt2)", lineHeight: 1.6 }}>
                {DISCOUNT_STEP} 별조각 = {won(DISCOUNT_STEP * WON_PER_MILEAGE)}원 · 월 최대 {won(DISCOUNT_CAP_WON)}원
                <br />
                적립된 할인 <b style={{ color: "var(--iv-purple2)" }}>{won(user.discountWon)}원</b>
                {user.discountWon > 0 && ` → 다음 결제 ${won(netPrice)}원`}
              </div>
              <Button block onClick={onRedeem} style={{ marginTop: 10 }} disabled={user.stardust < DISCOUNT_STEP}>
                {DISCOUNT_STEP} 별조각 교환하기
              </Button>
            </div>
          )}
          {msg && <div style={{ fontSize: 11.5, color: "var(--iv-purple2)", marginTop: 10 }}>{msg}</div>}
        </Card>

        <Card>
          <div className="iv-section-h">지금 쓸 수 있는 만큼</div>
          <div style={{ fontSize: 12.5, color: "var(--iv-txt2)", lineHeight: 1.7 }}>
            모모 대화 · {isUnlimited(chatLeft) ? "무제한" : `오늘 ${chatLeft}턴 남음`}
            <br />
            일기 · {isUnlimited(diaryLeft) ? "무제한" : `이번 주 ${diaryLeft}개 남음`}
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">무료</div>
          <Bullet ok>모모 대화 하루 {PLAN_LIMITS.free.chatTurnsPerDay}턴</Bullet>
          <Bullet ok>일기 주 {PLAN_LIMITS.free.diaryPerWeek}개</Bullet>
          <Bullet ok>이번 주 리뷰</Bullet>
          <Bullet ok={false}>지난 주 일기는 감정 요약만 남아요</Bullet>
          <Bullet ok={false}>장기 패턴 분석</Bullet>
        </Card>

        <Card variant="purple">
          <div className="iv-section-h" style={{ color: "#fff" }}>
            이너버스 플러스 · 월 {won(PLUS_PRICE_WON)}원
          </div>
          <Bullet ok>모모 대화 무제한</Bullet>
          <Bullet ok>일기 무제한 · 원문 영구 보관</Bullet>
          <Bullet ok>월·분기 장기 감정 패턴 분석</Bullet>
          <Button
            block
            style={{ marginTop: 12 }}
            onClick={() => {
              setPlan(free ? "plus" : "free");
              setMsg(free ? "플러스로 전환했어요." : "무료 플랜으로 돌아왔어요.");
            }}
          >
            {free ? (user.discountWon > 0 ? `${won(netPrice)}원으로 시작하기` : "플러스 시작하기") : "무료 플랜으로 변경"}
          </Button>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)", marginTop: 8, textAlign: "center" }}>
            결제 연동 전 단계라 지금은 즉시 전환돼요.
          </div>
        </Card>
      </Body>
    </>
  );
}
