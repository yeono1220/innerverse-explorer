// 퀘스트 보상/달성 기준을 튜닝했을 때 실제 동작에 그대로 반영되는지 검증한다.
// 보상 숫자를 하드코딩하지 않으므로 값을 조정해도 이 테스트는 고칠 필요가 없다.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, MOMO_QUEST_TURNS } from "./appStore";
import { useUsageStore } from "./usageStore";
import { useUserStore, DEFAULT_USER, todayStr, weekKey } from "./userStore";

function reset() {
  window.localStorage.clear();
  useUserStore.setState({ ...DEFAULT_USER, mileageUse: "discount", pendingLevelUp: null });
  useAppStore.setState({
    quests: useAppStore.getState().quests.map((q) => ({ ...q, done: false })),
    questsDate: todayStr(),
  });
  useUsageStore.setState({ day: todayStr(), chatTurns: 0, week: weekKey(), diaryCount: 0 });
}

describe("퀘스트 보상 지급", () => {
  beforeEach(reset);

  it("완료하면 정의된 보상만큼만 지급된다", () => {
    const q = useAppStore.getState().quests[0];
    useAppStore.getState().completeQuest(q.id);
    expect(useUserStore.getState().stardust).toBe(q.reward);
    expect(useUserStore.getState().mileageEarned).toBe(q.reward);
  });

  it("전부 완료하면 보상 합계와 정확히 일치한다", () => {
    const quests = useAppStore.getState().quests;
    const total = quests.reduce((sum, q) => sum + q.reward, 0);
    quests.forEach((q) => useAppStore.getState().completeQuest(q.id));
    expect(useUserStore.getState().stardust).toBe(total);
  });

  it("같은 퀘스트를 두 번 완료해도 보상은 한 번만", () => {
    const q = useAppStore.getState().quests[0];
    useAppStore.getState().completeQuest(q.id);
    useAppStore.getState().completeQuest(q.id);
    expect(useUserStore.getState().stardust).toBe(q.reward);
  });

  it("보상은 모두 양수", () => {
    useAppStore.getState().quests.forEach((q) => expect(q.reward).toBeGreaterThan(0));
  });
});

describe("모모 대화 퀘스트 — 하루 누적 턴 기준", () => {
  beforeEach(reset);

  // MomoChat의 판정을 그대로 재현: 한 턴 보내면 usageStore가 오르고, 그 값으로 판정.
  const sendTurn = () => {
    useUsageStore.getState().consumeChatTurn();
    if (useUsageStore.getState().chatTurns >= MOMO_QUEST_TURNS) {
      useAppStore.getState().completeQuest("q2");
    }
  };
  const q2done = () => !!useAppStore.getState().quests.find((q) => q.id === "q2")?.done;

  it("제목의 턴 수와 판정 기준이 일치한다", () => {
    const q2 = useAppStore.getState().quests.find((q) => q.id === "q2");
    expect(Number(q2!.title.match(/(\d+)\s*턴/)?.[1])).toBe(MOMO_QUEST_TURNS);
  });

  it("기준 턴에 도달해야 완료된다", () => {
    for (let i = 0; i < MOMO_QUEST_TURNS - 1; i += 1) sendTurn();
    expect(q2done()).toBe(false); // 한 턴 모자람
    sendTurn();
    expect(q2done()).toBe(true);
  });

  it("나갔다 다시 들어와도 카운트가 이어진다 (화면 상태가 아니라 하루 누적 기준)", () => {
    // 첫 방문: 3턴
    for (let i = 0; i < MOMO_QUEST_TURNS - 1; i += 1) sendTurn();
    expect(q2done()).toBe(false);
    // 뒤로가기 후 재진입 — MomoChat의 msgs는 초기화되지만 누적 턴은 남아 있다
    expect(useUsageStore.getState().chatTurns).toBe(MOMO_QUEST_TURNS - 1);
    sendTurn(); // 재진입 후 첫 턴
    expect(q2done()).toBe(true);
  });

  it("날짜가 바뀌면 누적 턴이 리셋된다", () => {
    sendTurn();
    useUsageStore.setState({ day: "2000-01-01" });
    useUsageStore.getState().ensureFresh();
    expect(useUsageStore.getState().chatTurns).toBe(0);
  });
});
