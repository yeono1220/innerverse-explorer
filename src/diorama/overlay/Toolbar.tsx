// 카메라 모드 토글 (궤도/산책) + 행성 톤 픽커 (펼침)
import { useEffect, useRef, useState } from "react";
import { useDioramaStore } from "../dioramaStore";
import { TONE_PRESETS, type ToneKey } from "../constants";

const TONES = Object.entries(TONE_PRESETS) as Array<[ToneKey, (typeof TONE_PRESETS)[ToneKey]]>;

export function Toolbar() {
  const mode = useDioramaStore((s) => s.cameraMode);
  const setMode = useDioramaStore((s) => s.setCameraMode);
  const toneKey = useDioramaStore((s) => s.toneKey);
  const setTone = useDioramaStore((s) => s.setTone);
  const [openTone, setOpenTone] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openTone) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpenTone(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [openTone]);

  return (
    <div className="iv-dioramatools" ref={wrap}>
      <div className="iv-dioramatoggle" role="tablist" aria-label="카메라 모드">
        <button
          className={mode === "orbit" ? "on" : ""}
          onClick={() => setMode("orbit")}
          aria-pressed={mode === "orbit"}
        >
          🪐 궤도
        </button>
        <button
          className={mode === "walk" ? "on" : ""}
          onClick={() => setMode("walk")}
          aria-pressed={mode === "walk"}
        >
          👣 산책
        </button>
      </div>
      {/*
      <button
        className="iv-dioramatone"
        onClick={() => setOpenTone((v) => !v)}
        aria-label="행성 톤 선택"
        aria-expanded={openTone}
      >
        🎨
      </button>
      */}

      {openTone && (
        <div className="iv-dioramatonepanel" role="listbox" aria-label="행성 톤">
          {TONES.map(([k, t]) => (
            <button
              key={k}
              className={`iv-dioramatoneswatch${toneKey === k ? " on" : ""}`}
              onClick={() => setTone(k)}
              style={{ background: `radial-gradient(circle at 30% 25%, ${t.hi}, ${t.mid} 60%, ${t.lo} 100%)` }}
              title={t.label}
              aria-label={t.label}
              aria-selected={toneKey === k}
            />
          ))}
        </div>
      )}
    </div>
  );
}
