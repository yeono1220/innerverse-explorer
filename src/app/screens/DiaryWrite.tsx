// 04 · 일기 작성 (녹음 + 텍스트). 분석은 mock — 키워드 매칭으로 감정 비중 추정.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Button } from "../ui/primitives";
import { useDiaryStore, type EmotionLabel } from "@/store/diaryStore";
import { analyzeVision } from "@/lib/api";
import { analyzeText, makePreview, VOICE_ONLY_BODY } from "@/lib/diaryAnalyze";
import { useUsageStore } from "@/store/usageStore";
import { useUserStore } from "@/store/userStore";
import { limitsFor, isUnlimited } from "@/lib/plan";
import { PlanNotice } from "../ui/PlanNotice";
import { BusyOverlay } from "../ui/BusyOverlay";

const LOC_DENIED_HELP =
  "위치 권한이 꺼져 있어요. 주소창의 자물쇠(ⓘ) → 위치 → 허용으로 바꾼 뒤 다시 눌러주세요";

/**
 * 좌표 → 동네 이름 (예: "마포구 합정동"). OpenStreetMap Nominatim 역지오코딩, 5초 제한.
 * 실패하면 null → 호출부가 "위치 기록됨"으로 폴백. 좌표 자체는 어디에도 저장하지 않는다.
 */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 5000);
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=ko` +
      `&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    window.clearTimeout(t);
    if (!res.ok) return null;
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    const district = a.city_district || a.borough || a.county || "";
    const town = a.suburb || a.quarter || a.neighbourhood || a.village || a.town || "";
    const parts = Array.from(new Set([district, town].filter(Boolean)));
    return parts.length ? parts.join(" ") : a.city || null;
  } catch {
    return null;
  }
}

export default function DiaryWrite() {
  const nav = useNavigate();
  const add = useDiaryStore((s) => s.add);
  // 무료 플랜: 주간 일기 개수 제한 (구독자는 무제한)
  const diaryCount = useUsageStore((s) => s.diaryCount);
  const consumeDiary = useUsageStore((s) => s.consumeDiary);
  const ensureFresh = useUsageStore((s) => s.ensureFresh);
  const plan = useUserStore((s) => s.plan);
  const diaryLeft = Math.max(0, limitsFor(plan).diaryPerWeek - diaryCount);
  const quotaOver = diaryLeft <= 0;
  useEffect(() => {
    ensureFresh(); // 주가 바뀌었으면 카운터 리셋
  }, [ensureFresh]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioSec, setAudioSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [signal, setSignal] = useState<string | null>(null); // 사진/위치 패시브 신호 노트
  const [photoBusy, setPhotoBusy] = useState(false);

  // 사진 → Vision으로 장면/분위기 추출 → 일기 맥락으로 추가
  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const v = await analyzeVision(file);
      const tag = `[📷 ${v.scene || v.labels.join(", ")}]`;
      setText((t) => (t ? t + "\n" + tag : tag));
      setSignal(`사진 인식: ${v.labels.slice(0, 3).join(" · ")}`);
    } catch {
      setSignal("사진 분석 실패 (AI 키 확인)");
    } finally {
      setPhotoBusy(false);
    }
  };

  // 위치(GPS) → 동네 이름으로 바꿔 일기 맥락에 넣는다 (좌표는 저장하지 않음).
  //  · 실패 원인별 안내: 권한 거부 / 시간 초과(실내) / 기기 위치 서비스 꺼짐
  //  · 이미 거부된 상태면 브라우저가 다시 묻지 않으므로 설정 경로를 안내
  const onLoc = async () => {
    if (!navigator.geolocation) {
      setSignal("이 기기는 위치를 지원하지 않아요");
      return;
    }
    try {
      const st = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
      if (st?.state === "denied") {
        setSignal(LOC_DENIED_HELP);
        return;
      }
    } catch {
      /* permissions API 미지원 브라우저 — 그냥 시도 */
    }
    setSignal("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const place = await reverseGeocode(latitude, longitude);
        const tag = place ? `[📍 ${place}]` : "[📍 위치 기록됨]";
        setText((t) => (t ? t + "\n" + tag : tag));
        setSignal(place ? `위치: ${place} · 동의 기반` : "위치 기록됨 · 동의 기반");
      },
      (err) => {
        setSignal(
          err.code === err.PERMISSION_DENIED
            ? LOC_DENIED_HELP
            : err.code === err.TIMEOUT
              ? "위치를 찾는 데 시간이 오래 걸려요. 창가나 실외에서 다시 눌러주세요"
              : "지금은 위치를 확인할 수 없어요. 기기의 위치 서비스가 켜져 있는지 확인해 주세요",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // 음성 → 자동 받아쓰기 (브라우저 내장 STT, 한국어). 말하면 일기로 채워짐.
  const toggleRec = () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("이 브라우저는 음성 인식을 지원하지 않아요. Chrome에서 써주세요 🙏");
      return;
    }
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = true;
    let base = text ? text + " " : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) base += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText((base + interim).trimStart());
    };
    rec.onend = () => {
      setRecording(false);
      if (timer.current) window.clearInterval(timer.current);
    };
    rec.onerror = () => {
      setRecording(false);
      if (timer.current) window.clearInterval(timer.current);
    };
    recRef.current = rec;
    setAudioSec(0);
    setRecording(true);
    timer.current = window.setInterval(() => setAudioSec((s) => s + 1), 1000);
    rec.start();
  };

  const onSubmit = async () => {
    if ((!text.trim() && audioSec === 0) || loading) return;
    if (!consumeDiary()) return; // 이번 주 한도 초과 → 저장하지 않음
    setLoading(true);

    // 작성·수정이 같은 분석 파이프라인을 쓴다 (백엔드 우선, 실패 시 규칙 기반)
    const analyzed = await analyzeText(text);

    const entry = add({
      date: new Date().toISOString().slice(0, 10),
      preview: makePreview(text),
      body: text.trim() || VOICE_ONLY_BODY,
      audioSec,
      emotions: analyzed.emotions,
      keywords: analyzed.keywords,
      primary: analyzed.primary,
      insight: analyzed.insight ?? null,
    });

    // 로그인 상태면 DB에도 저장 (비로그인/실패는 조용히 무시)
    void (async () => {
      try {
        const { isSupabaseConfigured } = await import("@/lib/supabase");
        if (!isSupabaseConfigured) return;
        const { saveDiaryEntry } = await import("@/services/diaryApi");
        await saveDiaryEntry({
          date: entry.date,
          preview: entry.preview,
          body: entry.body,
          audioSec: entry.audioSec,
          emotions: entry.emotions,
          keywords: entry.keywords,
          primary: entry.primary,
          insight: entry.insight ?? null,
        });
        // 장기기억 갱신 (③④ 사실·성향 추출) — 비동기, 실패 무시
        const { reflect } = await import("@/services/memory");
        await reflect();
      } catch {
        /* 무시 */
      }
    })();

    setLoading(false);
    nav(`/diary/result/${entry.id}`, { replace: true });
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="오늘의 마음" />
      <Body>
        <div style={{ fontSize: 12, color: "var(--iv-txt2)" }}>
          {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          {!isUnlimited(diaryLeft) && ` · 이번 주 ${diaryLeft}개 남음`}
        </div>

        {quotaOver && (
          <PlanNotice
            title="이번 주 일기를 다 썼어요"
            body="무료 플랜은 주 5개예요. 다음 주 월요일에 다시 채워지고, 플러스는 개수 제한 없이 쓸 수 있어요."
          />
        )}
        <textarea
          className="iv-input iv-textarea"
          placeholder={
            recording
              ? "🎙 듣고 있어요 — 말하는 대로 적혀요…"
              : "오늘 있었던 일, 떠오르는 감정을 적어보거나 🎤를 눌러 말해주세요…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={recording}
        />

        {audioSec > 0 && !recording && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(163,148,247,.14)",
              border: "1px solid rgba(163,148,247,.3)",
              fontSize: 12.5,
              color: "var(--iv-purple2)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🎙 {audioSec}초 말한 내용을 받아썼어요 — 그대로 보내면 일기가 돼요
            <button
              onClick={() => setAudioSec(0)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--iv-txt3)", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}

        {signal && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--iv-purple2)", display: "flex", alignItems: "center", gap: 6 }}>
            ✦ {signal}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
        />

        <div style={{ marginTop: "auto", display: "flex", gap: 8, paddingTop: 16, alignItems: "center" }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            style={{
              width: 46,
              height: 56,
              borderRadius: 14,
              border: "none",
              background: "var(--iv-surf2)",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              flex: "0 0 auto",
              opacity: photoBusy ? 0.5 : 1,
            }}
            aria-label="사진 추가"
          >
            {photoBusy ? "…" : "📷"}
          </button>
          <button
            onClick={onLoc}
            style={{
              width: 46,
              height: 56,
              borderRadius: 14,
              border: "none",
              background: "var(--iv-surf2)",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
            aria-label="위치 기록"
          >
            📍
          </button>
          <button
            onClick={toggleRec}
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              border: "none",
              background: recording ? "rgba(232,116,78,.25)" : "var(--iv-surf2)",
              color: recording ? "#e8744e" : "#fff",
              fontSize: 24,
              cursor: "pointer",
              boxShadow: recording ? "0 0 20px -4px rgba(232,116,78,.5)" : "none",
              flex: "0 0 auto",
            }}
            aria-label={recording ? "녹음 중지" : "녹음 시작"}
          >
            {recording ? "■" : "🎤"}
          </button>
          <Button block onClick={onSubmit} disabled={loading || quotaOver || (!text.trim() && audioSec === 0)}>
            {quotaOver ? "이번 주 한도를 다 썼어요" : loading ? "✦ 우주로 보내는 중…" : "✦ 우주로 전송하기"}
          </Button>
        </div>
      </Body>
      <BusyOverlay
        open={loading}
        label="전송중"
        hint="마음을 읽고 감정과 키워드를 뽑고 있어요. 잠시만요."
      />
    </>
  );
}
