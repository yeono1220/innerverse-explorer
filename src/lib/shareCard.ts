// 공유 카드 — 일기 한 편을 9:16 이미지(1080×1920)로 그려 인스타 스토리/저장용으로 만든다.
// 전부 클라이언트(canvas)에서 그리므로 서버·AI 비용 0. 그로스 루프의 단위:
//   기록 → 카드 → SNS 공유 → 링크(utm) 유입 → 로그인 없이 체험.
import { EMOTION_COLORS, type DiaryEntry } from "@/store/diaryStore";
import { buildFacets } from "@/app/ui/planet";
import { MOMO_IMAGE_SRC } from "@/app/ui/AssetImage";

export const SHARE_URL = "https://innerverse-explorer.vercel.app/?utm_source=share&utm_medium=card";
const SHOW_URL = "innerverse-explorer.vercel.app";
const W = 1080;
const H = 1920;
const FONT = "Pretendard, 'Space Grotesk', -apple-system, 'Segoe UI', sans-serif";

function hx(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mixHex(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
/** 감정색 하나로 행성 결정면 톤(hi/mid/lo)을 만든다. */
function toneOf(color: string) {
  return { hi: mixHex(color, "#ffffff", 0.45), mid: color, lo: mixHex(color, "#000000", 0.55) };
}

// 한국어는 단어 경계가 약해 글자 단위로 줄바꿈한다.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const src = text.replace(/\s+/g, " ").trim();
  for (const ch of src) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur.trim());
      cur = ch === " " ? "" : ch;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  const shown = lines.join("").replace(/\s/g, "").length;
  if (lines.length === maxLines && shown < src.replace(/\s/g, "").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, "") + "…";
  }
  return lines;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 일기 id 기반 결정적 난수 (같은 일기는 같은 별 배치)
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export async function renderShareCard(entry: DiaryEntry): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const color = EMOTION_COLORS[entry.primary] ?? "#5fc88a";

  // 배경
  const g = ctx.createRadialGradient(W * 0.5, H * 0.32, 80, W * 0.5, H * 0.32, H * 0.9);
  g.addColorStop(0, "#1b1430");
  g.addColorStop(0.55, "#0c0a16");
  g.addColorStop(1, "#07060d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = rng(entry.id);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const s = rnd() * 2.2 + 0.4;
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 상단 캡션
  ctx.textAlign = "center";
  ctx.fillStyle = "#9b95ad";
  ctx.font = `600 30px ${FONT}`;
  ctx.letterSpacing = "10px";
  ctx.fillText("INNERVERSE", W / 2, 150);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#b8b0d8";
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText(fmtDate(entry.date), W / 2, 210);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 62px ${FONT}`;
  ctx.fillText(`오늘 내 행성은 ‘${entry.primary}’`, W / 2, 310);

  // 행성 (결정면) + 글로우
  const size = 600;
  const px = W / 2 - size / 2;
  const py = 400;
  ctx.save();
  ctx.shadowColor = color + "aa";
  ctx.shadowBlur = 90;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(W / 2, py + size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(px, py);
  for (const f of buildFacets(size, toneOf(color))) {
    const pts = f.points.split(" ").map((p) => p.split(",").map(Number));
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.strokeStyle = f.fill;
    ctx.lineWidth = 0.8;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  // 모모
  const momo = await loadImg(MOMO_IMAGE_SRC);
  if (momo) {
    const ms = 210;
    ctx.drawImage(momo, W / 2 - ms / 2, py + size - ms * 0.78, ms, ms);
  }

  // 감정 태그
  const tagY = py + size + 70;
  ctx.font = `700 34px ${FONT}`;
  const tw = ctx.measureText(entry.primary).width + 64;
  rr(ctx, W / 2 - tw / 2, tagY - 30, tw, 60, 30);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#0c0a16";
  ctx.fillText(entry.primary, W / 2, tagY + 12);

  // 감정 비중 top3
  const top = entry.emotions.slice(0, 3);
  let by = tagY + 100;
  ctx.textAlign = "left";
  for (const e of top) {
    const c = EMOTION_COLORS[e.label] ?? "#8a82a0";
    ctx.fillStyle = "#e6e1f5";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(e.label, 120, by + 12);
    rr(ctx, 230, by - 10, 620, 22, 11);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fill();
    rr(ctx, 230, by - 10, Math.max(22, 620 * Math.min(1, e.pct / 100)), 22, 11);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.textAlign = "right";
    ctx.fillStyle = "#b8b0d8";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(`${e.pct}%`, 960, by + 12);
    ctx.textAlign = "left";
    by += 64;
  }

  // 모모의 해석 카드
  const note =
    entry.insight?.reframe?.trim() ||
    entry.insight?.reason?.trim() ||
    `오늘은 ‘${entry.primary}’의 결이 도드라졌어요. 행성 표면이 살짝 다르게 빛나기 시작했어요.`;
  const cardY = by + 20;
  const cardH = 300;
  rr(ctx, 90, cardY, W - 180, cardH, 36);
  ctx.fillStyle = "rgba(124,111,232,0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(163,148,247,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#c9c0ff";
  ctx.font = `700 26px ${FONT}`;
  ctx.letterSpacing = "4px";
  ctx.fillText("MOMO'S NOTE", 140, cardY + 62);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 36px ${FONT}`;
  const lines = wrap(ctx, note, W - 280, 4);
  lines.forEach((l, i) => ctx.fillText(l, 140, cardY + 130 + i * 54));

  // 키워드
  if (entry.keywords.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#b8b0d8";
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(entry.keywords.slice(0, 4).map((k) => `#${k}`).join("   "), W / 2, cardY + cardH + 56);
  }

  // 푸터
  ctx.textAlign = "center";
  ctx.fillStyle = "#7d7896";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText("내 마음의 우주를 기록하는 곳", W / 2, H - 104);
  ctx.fillStyle = "#a394f7";
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(SHOW_URL, W / 2, H - 56);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

export type ShareResult = "shared" | "downloaded" | "cancel";

/** 모바일이면 OS 공유 시트(인스타 스토리 등), 아니면 PNG 다운로드 + 링크 복사. */
export async function shareEntryCard(entry: DiaryEntry): Promise<ShareResult> {
  const blob = await renderShareCard(entry);
  const file = new File([blob], `innerverse-${entry.date}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "내 마음의 행성", text: `오늘 내 행성은 ‘${entry.primary}’ — INNERVERSE ${SHARE_URL}` });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancel";
      /* 공유 실패 → 다운로드 폴백 */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try {
    await navigator.clipboard.writeText(SHARE_URL);
  } catch {
    /* 클립보드 미지원 */
  }
  return "downloaded";
}
