// 09 · 출석 보상 (14일 캘린더)
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, CapLabel } from "../ui/primitives";
import { useUserStore, REWARDS, todayStr, dayDiff } from "@/store/userStore";

export default function Attendance() {
  const streak = useUserStore((s) => s.streak);
  const stardust = useUserStore((s) => s.stardust);
  const lastCheckIn = useUserStore((s) => s.lastCheckIn);
  const claimDailyReward = useUserStore((s) => s.claimDailyReward);

  // 오늘 날짜(로컬) 기준으로 실제 연속 출석 상태를 계산한다.
  const todayKey = todayStr();
  const gap = lastCheckIn ? dayDiff(lastCheckIn, todayKey) : Infinity;
  const claimedToday = gap === 0; // 오늘 이미 수령
  // 하루라도 걸렀으면(간격 2일 이상) 스트릭은 끊긴 것 → 0 (= 오늘이 첫날)
  const currentStreak = gap === 0 || gap === 1 ? streak : 0;
  const completedCount = currentStreak; // ✓ 로 채워진 칸 수
  // 강조할 "오늘" 칸: 이미 받았으면 방금 채운 칸, 아니면 다음에 받을 칸
  const todayIndex = claimedToday ? Math.max(0, currentStreak - 1) : currentStreak;
  // 오늘이 며칠째인지(1~14)와 그에 해당하는 보상
  const todayDay = claimedToday ? currentStreak : currentStreak + 1;
  const reward = REWARDS[Math.min(Math.max(todayDay - 1, 0), REWARDS.length - 1)] ?? 5;

  // 하루 1회만: 오늘 이미 받았으면 무시. 연속/리셋 판정은 store가 처리.
  const claim = () => {
    if (!claimedToday) claimDailyReward();
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="출석 보상" />
      <Body>
        <div style={{ textAlign: "center" }}>
          <CapLabel>STREAK</CapLabel>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{currentStreak}일 연속</h2>
          <p style={{ fontSize: 12.5, color: "var(--iv-txt2)", marginTop: 6 }}>
            별조각 ✦{stardust} · {claimedToday ? "오늘 출석 완료 ✓" : `오늘 보상 +${reward}`}
          </p>
        </div>

        <Card>
          <div className="iv-section-h">14일 캘린더</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            {Array.from({ length: 14 }).map((_, i) => {
              const done = i < completedCount;
              const isToday = i === todayIndex;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 12,
                    background: done
                      ? "linear-gradient(135deg,#5fc88a55,#5fc88a22)"
                      : "rgba(255,255,255,.03)",
                    border: isToday
                      ? "1px solid var(--iv-purple2)"
                      : "1px solid var(--iv-line)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: done ? "var(--iv-green)" : "var(--iv-txt3)",
                    fontSize: 11,
                    fontWeight: 700,
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 14 }}>{done ? "✓" : i + 1}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>+{REWARDS[i]}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card variant="purple">
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            14일을 채우면 <b>특별 행성 데코</b>를 얻을 수 있어요. 오늘도 한 줄로 출석 도장.
          </div>
        </Card>

        <Button
          block
          onClick={claim}
          disabled={claimedToday}
          style={claimedToday ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          {claimedToday
            ? "오늘 출석 완료 ✓ 내일 또 만나요"
            : `오늘의 별조각 받기 +${reward}`}
        </Button>
      </Body>
    </>
  );
}
