// 2D 행성 + 모모 — 저폴리 결정면(faceted) SVG. /home 정20면체 행성과 같은 결.
// color/size API는 그대로라 모든 화면(12곳)에 드롭인.
import { useId, useMemo } from "react";
import { AssetImage, MOMO_IMAGE_SRC } from "./AssetImage";
import { PlanetColor, PLANET_COLORS } from "@/store/userStore";

interface Tone {
  hi: string;
  mid: string;
  lo: string;
}

function hx(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// 구면 노멀 기반 라이팅으로 결정면 색을 계산해 삼각형 목록 생성.
function buildFacets(size: number, c: Tone) {
  const R = size / 2;
  const cx = R;
  const cy = R;
  const rings = 4;
  const seg = 16;
  const L = [-0.45, -0.55, 0.7];

  const pts: { x: number; y: number }[][] = [[{ x: cx, y: cy }]];
  for (let r = 1; r <= rings; r++) {
    const rr = (R * r) / rings;
    const off = (r % 2) * (Math.PI / seg);
    const arr: { x: number; y: number }[] = [];
    for (let s = 0; s < seg; s++) {
      const ang = off + (s / seg) * 2 * Math.PI;
      arr.push({ x: cx + rr * Math.cos(ang), y: cy + rr * Math.sin(ang) });
    }
    pts.push(arr);
  }

  const tris: { x: number; y: number }[][] = [];
  for (let s = 0; s < seg; s++) tris.push([pts[0][0], pts[1][s], pts[1][(s + 1) % seg]]);
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const A = pts[r][s];
      const B = pts[r][(s + 1) % seg];
      const C = pts[r + 1][s];
      const D = pts[r + 1][(s + 1) % seg];
      tris.push([A, B, D]);
      tris.push([A, D, C]);
    }
  }

  const lp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const mix = (t: number) => {
    let A: string, B: string, u: number;
    if (t < 0.5) {
      A = c.lo;
      B = c.mid;
      u = t * 2;
    } else {
      A = c.mid;
      B = c.hi;
      u = (t - 0.5) * 2;
    }
    const a = hx(A);
    const b = hx(B);
    return `rgb(${lp(a[0], b[0], u)},${lp(a[1], b[1], u)},${lp(a[2], b[2], u)})`;
  };

  return tris.map((t) => {
    const mx = (t[0].x + t[1].x + t[2].x) / 3;
    const my = (t[0].y + t[1].y + t[2].y) / 3;
    const nx = (mx - cx) / R;
    const ny = (my - cy) / R;
    const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
    let b = nx * L[0] + ny * L[1] + nz * L[2];
    b = Math.max(0, Math.min(1, b * 0.95 + 0.12));
    const fill = mix(b);
    return { points: t.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), fill };
  });
}

export function Planet2D({
  color = "green",
  size = 140,
  withMomo,
  withDeco,
}: {
  color?: PlanetColor;
  size?: number;
  withMomo?: boolean;
  withDeco?: boolean;
}) {
  const c = PLANET_COLORS[color];
  const R = size / 2;
  const clipId = useId().replace(/:/g, "") + "-pl";
  const facets = useMemo(() => buildFacets(size, c), [size, c]);

  return (
    <div style={{ position: "relative", width: size, height: size }} aria-hidden="true">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", filter: `drop-shadow(0 0 ${size * 0.13}px ${c.glow})` }}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={R} cy={R} r={R - 0.5} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {facets.map((f, i) => (
            <polygon key={i} points={f.points} fill={f.fill} stroke={f.fill} strokeWidth={0.6} />
          ))}
        </g>
        <circle cx={R} cy={R} r={R - 0.5} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
      </svg>

      {withDeco && (
        <div style={{ position: "absolute", top: "18%", left: "20%", fontSize: size * 0.13, opacity: 0.9 }}>🌲</div>
      )}
      {withMomo && (
        <div style={{ position: "absolute", left: "50%", bottom: "8%", transform: "translateX(-50%)" }}>
          <Momo2D size={Math.round(size * 0.32)} />
        </div>
      )}
    </div>
  );
}

export function Momo2D({ size = 64 }: { size?: number }) {
  return (
    <AssetImage src={MOMO_IMAGE_SRC} size={size}>
      <div className="iv-momo" style={{ "--m-size": `${size}px` } as React.CSSProperties} aria-hidden="true" />
    </AssetImage>
  );
}
