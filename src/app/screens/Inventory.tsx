// 12 · 인벤토리 (3열 그리드, 별조각으로 구매)
import { useEffect, useRef, useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Chip, Button, CapLabel } from "../ui/primitives";
import { useAppStore } from "@/store/appStore";
import { useUserStore } from "@/store/userStore";

const CATS = [
  { key: "all", label: "전체" },
  { key: "deco", label: "데코" },
  { key: "weather", label: "날씨" },
  { key: "creature", label: "생명체" },
] as const;

export default function Inventory() {
  const items = useAppStore((s) => s.inventory);
  const buy = useAppStore((s) => s.buyItem);
  const stardust = useUserStore((s) => s.stardust);
  const [cat, setCat] = useState<(typeof CATS)[number]["key"]>("all");
  const [selected, setSelected] = useState<string | null>(null);
  // 구매 직후 "행성에 설치됐다"는 사실을 잠깐 알려준다.
  const [placed, setPlaced] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const placedTimer = useRef<number | null>(null);
  const insufficientTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (placedTimer.current) window.clearTimeout(placedTimer.current);
    if (insufficientTimer.current) window.clearTimeout(insufficientTimer.current);
  }, []);

  const list = cat === "all" ? items : items.filter((i) => i.category === cat);
  const sel = items.find((i) => i.id === selected);

  // 잔액 차감은 buyItem 내부에서 처리한다(단일 출처).
  const onBuy = () => {
    if (!sel || sel.owned) return;
    if (stardust < sel.price) {
      setInsufficient(true);
      if (insufficientTimer.current) window.clearTimeout(insufficientTimer.current);
      insufficientTimer.current = window.setTimeout(() => setInsufficient(false), 2600);
      return;
    }
    if (!buy(sel.id)) return;
    // 구매하면 store가 행성 위 랜덤 위치에 설치(홈/글래스 공통).
    setPlaced(sel.id);
    if (placedTimer.current) window.clearTimeout(placedTimer.current);
    placedTimer.current = window.setTimeout(() => setPlaced(null), 2600);
  };

  return (
    <>
      <StatusBar />
      <AppBar
        back
        title="인벤토리"
        right={
          <div style={{ fontSize: 12, color: "#e8c45f", fontWeight: 700, padding: "0 4px" }}>
            ✦ {stardust}
          </div>
        }
      />
      <Body>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATS.map((c) => (
            <Chip key={c.key} active={c.key === cat} onClick={() => setCat(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {list.map((it) => {
            const active = selected === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setSelected(it.id)}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 16,
                  background: it.owned
                    ? "linear-gradient(135deg,rgba(163,148,247,.18),rgba(124,111,232,.08))"
                    : "var(--iv-surf)",
                  border: active
                    ? "1px solid var(--iv-purple2)"
                    : it.owned
                    ? "1px solid rgba(163,148,247,.45)"
                    : "1px solid var(--iv-line)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 34 }}>{it.emoji}</div>
                <div style={{ fontSize: 11, color: "var(--iv-txt2)" }}>{it.name}</div>
                {!it.owned && (
                  <div style={{ position: "absolute", top: 6, right: 6, fontSize: 10, color: "#e8c45f", fontWeight: 700 }}>
                    ✦ {it.price}
                  </div>
                )}
                {it.owned && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "rgba(95,200,138,.25)",
                      color: "var(--iv-green)",
                      fontWeight: 700,
                    }}
                  >
                    소유
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {sel && (
          <div
            style={{
              marginTop: "auto",
              padding: 14,
              borderRadius: 18,
              background: "var(--iv-surf)",
              border: "1px solid var(--iv-line)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 36 }}>{sel.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{sel.name}</div>
              <div style={{ fontSize: 11, color: "var(--iv-txt2)" }}>
                {sel.owned ? "🪐 행성에 설치했어요" : `별조각 ${sel.price}개`}
              </div>
            </div>
            <Button onClick={onBuy} disabled={sel.owned /*|| stardust < sel.price*/}>
              {sel.owned ? "보유 중" : "구매"}
            </Button>
          </div>
        )}

        {insufficient && sel && (
          <div
            role="alert"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 154,
              transform: "translateX(-50%)",
              width: "min(320px, calc(100% - 44px))",
              padding: "13px 16px",
              borderRadius: 16,
              background: "rgba(30, 22, 55, .96)",
              border: "1px solid var(--iv-purple2)",
              boxShadow: "0 12px 32px rgba(74, 58, 138, .45)",
              color: "var(--iv-txt)",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "center",
              zIndex: 50,
            }}
          >
            ✨ 별조각이 부족해요
            <div style={{ marginTop: 4, color: "var(--iv-txt2)", fontSize: 11.5, fontWeight: 500 }}>
              {sel.name} 구매에 별조각 {sel.price - stardust}개가 더 필요해요.
            </div>
          </div>
        )}
      </Body>
    </>
  );
}
