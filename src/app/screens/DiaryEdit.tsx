// 09 · 일기 수정 (본문만 고치고, 저장 시 감정·키워드 재분석)
// 일기 삭제는 제공하지 않는다 — 기록은 남기되 고쳐 쓸 수만 있게.
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Button, Card } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore } from "@/store/diaryStore";
import { analyzeText, makePreview } from "@/lib/diaryAnalyze";
import { BusyOverlay } from "../ui/BusyOverlay";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function DiaryEdit() {
  const nav = useNavigate();
  const { id } = useParams();
  const entry = useDiaryStore((s) => (id ? s.byId(id) : undefined));
  const update = useDiaryStore((s) => s.update);
  const [text, setText] = useState(entry?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const changed = useMemo(() => !!entry && text.trim() !== entry.body.trim(), [text, entry]);

  const onSave = async () => {
    if (!entry || !id || saving || !changed || !text.trim()) return;
    setSaving(true);
    setErr(null);

    // 본문이 바뀌었으니 감정 비중·키워드를 다시 뽑는다 (작성 때와 같은 파이프라인)
    const analyzed = await analyzeText(text);
    const patch = {
      body: text.trim(),
      preview: makePreview(text),
      emotions: analyzed.emotions,
      keywords: analyzed.keywords,
      primary: analyzed.primary,
    };
    update(id, patch);

    // 로그인 상태면 DB에도 반영 (실패해도 로컬 수정은 유지)
    try {
      const { updateDiaryEntry } = await import("@/services/diaryApi");
      await updateDiaryEntry(id, patch);
    } catch {
      setErr("서버 저장에 실패했어요. 기기에는 저장됐고, 다음 접속 때 다시 시도돼요.");
    }

    setSaving(false);
    nav(`/diary/${id}`, { replace: true });
  };

  if (!entry) {
    return (
      <>
        <StatusBar />
        <AppBar back title="일기 수정" />
        <Body>
          <div style={{ textAlign: "center", color: "var(--iv-txt2)", padding: 40 }}>일기를 찾을 수 없어요.</div>
        </Body>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <AppBar back title="일기 수정" />
      <Body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--iv-txt2)" }}>{formatDate(entry.date)}</div>
          <EmotionTag label={entry.primary} />
        </div>

        <textarea
          className="iv-input iv-textarea"
          placeholder="그때의 마음을 다시 적어볼까요…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />

        <Card size="sm">
          <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", lineHeight: 1.6 }}>
            저장하면 바뀐 내용으로 감정 비중과 키워드를 다시 분석해요. 지금 태그는{" "}
            <b style={{ color: "var(--iv-txt2)" }}>#{entry.keywords.join(" #") || "없음"}</b> 이에요.
            <br />
            작성한 날짜는 그대로 유지되고, 일기는 삭제할 수 없어요.
          </div>
        </Card>

        {err && (
          <div style={{ fontSize: 11.5, color: "var(--iv-emo-anger)", lineHeight: 1.5 }}>{err}</div>
        )}

        <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={() => nav(-1)} disabled={saving}>
            취소
          </Button>
          <Button block onClick={onSave} disabled={saving || !changed || !text.trim()}>
            {saving ? "✦ 다시 분석하는 중…" : changed ? "✦ 저장하고 다시 분석" : "바뀐 내용이 없어요"}
          </Button>
        </div>
      </Body>
      <BusyOverlay
        open={saving}
        label="다시 분석중"
        hint="바뀐 내용으로 감정 비중과 키워드를 새로 뽑고 있어요."
      />
    </>
  );
}
