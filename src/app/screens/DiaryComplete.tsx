// 17 · 모모 대화 → 일기 완성 시트
import { useLocation, useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore, type EmotionLabel } from "@/store/diaryStore";
import { generateDiaryFromChat, finalizeChatToDiary } from "@/services/momoApi";
import { analyzeDiary } from "@/lib/api";
import { useEmotionStore } from "@/store/emotionStore";
import { useUserStore } from "@/store/userStore";

interface Msg {
  who: "momo" | "me";
  text: string;
  emo?: EmotionLabel;
}

export default function DiaryComplete() {
  const nav = useNavigate();
  const loc = useLocation();
  const add = useDiaryStore((s) => s.add);
  const state = loc.state as { msgs?: Msg[]; sessionId?: string } | null;
  // const msgs: Msg[] = (loc.state as { msgs?: Msg[] })?.msgs ?? [];
  const msgs: Msg[] = state?.msgs ?? [];
  const sessionId = state?.sessionId; // 모모챗 세션 id — 대화 마무리 성능 요약용
  const myLines = msgs.filter((m) => m.who === "me");
  const body = myLines.map((m) => m.text).join(" ");
  const tally: Partial<Record<EmotionLabel, number>> = {};
  myLines.forEach((m) => {
    if (!m.emo) return;
    tally[m.emo] = (tally[m.emo] ?? 0) + 1;
  });
  const totalTags = Object.values(tally).reduce<number>((s, v) => s + (v ?? 0), 0) || 1;
  const emotions = (Object.entries(tally) as Array<[EmotionLabel, number]>)
    .map(([label, v]) => ({ label, pct: Math.round((v / totalTags) * 100) }))
    .sort((a, b) => b.pct - a.pct);
  const primary: EmotionLabel = emotions[0]?.label ?? "차분";
  const keywords = Array.from(body.matchAll(/[가-힣]{2,5}/g)).map((m) => m[0]).filter((w, i, a) => a.indexOf(w) === i).slice(0, 4);

  const onSave = async () => {
    if (!body) {
      nav("/home");
      return;
    }
    const turns = msgs.map((m) => ({ who: m.who, text: m.text, emo: m.emo as string | undefined }));
    let finalBody = body;
    const meta = {
      emotions: emotions.length ? emotions : [{ label: "차분" as EmotionLabel, pct: 100 }],
      keywords,
      primary,
    };
    // 1) 대화 → 1인칭 일기 자동생성 (실패 시 사용자 발화 이어붙이기 폴백)
    try {
      finalBody = await generateDiaryFromChat(turns, sessionId);
    } catch {
      /* body 유지 */
    }
    // 2) 감정/키워드를 백엔드 분석으로 보강 (실패 시 로컬 태그 유지)
    try {
      const ana = await analyzeDiary(finalBody || body);
      if (ana.emotions.length) meta.emotions = ana.emotions;
      if (ana.keywords.length) meta.keywords = ana.keywords;
      meta.primary = ana.primary;
      // 감정 → 행성 반영(7감정) + 성장(보상: 별가루)
      useEmotionStore.getState().setEmotions(ana.emo7);
      useUserStore.getState().earnStardust(10);
    } catch {
      /* 로컬 값 유지 */
    }
    // 3) Supabase: 대화 턴 저장 + 당일 일기 첨부/생성 + 임베딩 (비차단)
    void finalizeChatToDiary(turns, meta, finalBody).catch(() => {});
    // 4) 로컬 스토어 즉시 반영 + 상세로 이동
    const entry = add({
      date: new Date().toISOString().slice(0, 10),
      preview: finalBody.slice(0, 60),
      body: finalBody,
      audioSec: 0,
      emotions: meta.emotions,
      keywords: meta.keywords,
      primary: meta.primary,
    });
    nav(`/diary/${entry.id}`, { replace: true });
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="대화에서 일기로" />
      <Body>
        <Card variant="purple">
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.6 }}>
            대화를 들어보고 모모가 일기로 정리했어. 마음에 안 들면 직접 다듬어도 돼.
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">
            <span>오늘의 일기</span>
            {emotions.length > 0 && <EmotionTag label={primary} />}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--iv-txt)" }}>
            {body || "(아직 들려준 마음이 없어요.)"}
          </div>
        </Card>

        {keywords.length > 0 && (
          <Card size="sm">
            <div className="iv-section-h">키워드</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    fontSize: 12,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "var(--iv-surf2)",
                    color: "var(--iv-txt)",
                    fontWeight: 600,
                  }}
                >
                  #{k}
                </span>
              ))}
            </div>
          </Card>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
          <Button variant="ghost" block onClick={() => nav(-1)}>
            대화로 돌아가기
          </Button>
          <Button block onClick={onSave}>
            저장하기
          </Button>
        </div>
      </Body>
    </>
  );
}
