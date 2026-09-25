// '행성 카드 공유' 버튼 — 결과 화면·일기 상세 공용. 완료 후 짧은 안내 문구.
import { useState } from "react";
import { Button } from "./primitives";
import { IconButton } from "./layout";
import { shareEntryCard } from "@/lib/shareCard";
import type { DiaryEntry } from "@/store/diaryStore";

const MSG = {
  shared: "공유했어요 ✨",
  downloaded: "카드를 저장했어요 · 링크도 복사됐어요",
  cancel: "",
  error: "카드를 만들지 못했어요. 다시 시도해 주세요",
};

export function ShareCardButton({ entry, icon }: { entry: DiaryEntry; icon?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await shareEntryCard(entry);
      setMsg(MSG[r]);
    } catch {
      setMsg(MSG.error);
    } finally {
      setBusy(false);
      window.setTimeout(() => setMsg(""), 3500);
    }
  };

  if (icon) {
    return (
      <IconButton onClick={run} ariaLabel="행성 카드 공유">
        {busy ? "…" : "📤"}
      </IconButton>
    );
  }
  return (
    <div>
      <Button block onClick={run} disabled={busy}>
        {busy ? "카드 만드는 중…" : "📤 오늘의 행성 카드 공유"}
      </Button>
      {msg && (
        <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", textAlign: "center", marginTop: 6 }}>{msg}</div>
      )}
    </div>
  );
}
