// 09 · 출석 보상 (14일 캘린더)
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, CapLabel } from "../ui/primitives";
import { useUserStore, todayStr } from "@/store/userStore";
import { useAppStore } from "@/store/appStore";

const REWARDS = [3, 3, 5, 5, 8, 8, 10, 10, 12, 12, 15, 15, 20, 30];

export default function Attendance() {
  const streak = useUserStore((s) => s.streak);
  const stardust = useUserStore((s) => s.stardust);
  const claimDailyReward = useUserStore((s) => s.claimDailyReward);
  const lastCheckIn = useUserStore((s) => s.lastCheckIn);
  const attendance = useAppStore((s) => s.attendance);

  const reward = REWARDS[Math.min(streak, REWARDS.length - 1)] ?? 5;
  const claimedToday = lastCheckIn === todayStr();

  // 하루 1회만: 오늘 이미 받았으면 무시하고, 버튼도 disabled 처리.
  const claim = () => {
    if (claimedToday) return;
    claimDailyReward(reward);
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="출석 보상" />
      <Body>
        <div style={{ textAlign: "center" }}>
          <CapLabel>STREAK</CapLabel>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{streak}일 연속</h2>
          <p style={{ fontSize: 12.5, color: "var(--iv-txt2)", marginTop: 6 }}>
            별조각 {stardust}개 · 내일 보상 +{REWARDS[Math.min(streak, REWARDS.length - 1)] ?? 5}
          </p>
        </div>

        <Card>
          <div className="iv-section-h">14일 캘린더</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {Array.from({ length: 14 }).map((_, i) => {
              const done = attendance.includes(i);
              const today = i === streak;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 12,
                    background: done
                      ? "linear-gradient(135deg,#5fc88a55,#5fc88a22)"
                      : "rgba(255,255,255,.03)",
                    border: today
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
