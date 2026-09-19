// 모모의 기억 — 장기기억 4계층(③사실·④성향) + 사실/관계 + 수정·삭제(잊기) (PPT 765:852)
import { useEffect, useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, CapLabel } from "../ui/primitives";
import { getMemory, reflect, deleteFact, deleteRelation, type Memory } from "@/services/memory";
import { isSupabaseConfigured } from "@/lib/supabase";

function DelRow({ left, onDel }: { left: React.ReactNode; onDel: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--iv-line)",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--iv-txt)" }}>{left}</div>
      <button
        onClick={onDel}
        aria-label="잊기"
        style={{ background: "none", border: "none", color: "var(--iv-txt3)", cursor: "pointer", fontSize: 14 }}
      >
        ✕
      </button>
    </div>
  );
}

export default function Memory() {
  const [mem, setMem] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getMemory()
      .then(setMem)
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      await reflect();
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="모모의 기억" />
      <Body>
        <CapLabel>MEMORY · 모모가 기억하는 나</CapLabel>

        <Card>
          <div className="iv-section-h">사실 요약</div>
          <p style={{ fontSize: 13, color: "var(--iv-txt2)", lineHeight: 1.6 }}>
            {mem?.factSummary || "아직 충분한 기록이 없어요. 일기를 쌓으면 모모가 ‘나’를 알아가요."}
          </p>
        </Card>

        <Card>
          <div className="iv-section-h">성향·패턴</div>
          <p style={{ fontSize: 13, color: "var(--iv-txt2)", lineHeight: 1.6 }}>{mem?.personaSummary || "—"}</p>
        </Card>

        <Card>
          <div className="iv-section-h">사실</div>
          {mem?.facts.length ? (
            mem.facts.map((f) => (
              <DelRow
                key={f.id}
                left={
                  <span>
                    <b style={{ color: "var(--iv-purple2)" }}>{f.key}</b> · {f.value}
                  </span>
                }
                onDel={async () => {
                  await deleteFact(f.id);
                  load();
                }}
              />
            ))
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--iv-txt3)" }}>—</p>
          )}
        </Card>

        <Card>
          <div className="iv-section-h">관계</div>
          {mem?.relations.length ? (
            mem.relations.map((r) => (
              <DelRow
                key={r.id}
                left={
                  <span>
                    <b>{r.name}</b>
                    <span style={{ color: "var(--iv-txt3)" }}>
                      {" "}
                      · {r.relation}
                      {r.sentiment ? ` · ${r.sentiment}` : ""}
                    </span>
                  </span>
                }
                onDel={async () => {
                  await deleteRelation(r.id);
                  load();
                }}
              />
            ))
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--iv-txt3)" }}>—</p>
          )}
        </Card>

        <Button block onClick={refresh} disabled={busy || !isSupabaseConfigured}>
          {busy ? "기억 갱신 중…" : isSupabaseConfigured ? "지금 기억 갱신하기" : "Supabase 연결 및 로그인 필요"}
        </Button>
        <p style={{ fontSize: 11, color: "var(--iv-txt3)", lineHeight: 1.6, marginTop: 8 }}>
          모든 기억은 당신의 동의 하에 저장되고, ✕로 언제든 지울 수 있어요(잊기). 삭제하면 모모도 더는 기억하지 않아요.
        </p>
      </Body>
    </>
  );
}
