// 일기에 등장한 사람들을 행성 표면에 '주민'으로 얹는 3D 레이어.
// 위치는 이름 해시로 결정적 — 같은 사람은 항상 같은 자리. 감정(sentiment)에 따라 색이 다르다.
// 탭하면 onSelect(name) — 홈에서는 그 이름으로 일기 검색으로 보낸다.
import { useEffect, useMemo, useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useRelationsStore } from "@/store/relationsStore";
import { placementToVec3 } from "./placement";
import type { RelationRow } from "@/services/memory";

const SENTIMENT_COLOR: Record<string, string> = {
  긍정: "#5fc88a",
  갈등: "#e8744e",
  부정: "#e8744e",
  중립: "#9ec8ff",
};
const colorOf = (s: string | null | undefined) => SENTIMENT_COLOR[s ?? ""] ?? "#b8b0d8";

// 문자열 → 0..1 두 개 (fnv 해시)
function hash2(str: string): [number, number] {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = (h >>> 0) / 4294967296;
  h = Math.imul(h ^ 0x9e3779b9, 16777619);
  const b = (h >>> 0) / 4294967296;
  return [a, b];
}

/** 이름 해시 → 위도/경도. 모모가 서 있는 정면(lon=π/2, lat=0)과 북극은 피한다. */
function placementOf(name: string) {
  const [a, b] = hash2(name);
  const lat = Math.asin(a * 2 - 1) * 0.55; // ±~0.86rad → 극 회피
  let lon = b * Math.PI * 2;
  const dMomo = Math.acos(Math.cos(lat) * Math.cos(lon - Math.PI / 2));
  if (dMomo < 0.6) lon += 1.4;
  return { lat, lon, seed: a };
}

const texCache = new Map<string, THREE.Texture>();
/** 이니셜 원 + 이름 라벨 텍스처 (사람당 1회). */
function personTexture(name: string, color: string): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${name}|${color}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 320;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const font = "Pretendard, 'Segoe UI', sans-serif";
  // 원 아바타
  ctx.beginPath();
  ctx.arc(W / 2, 108, 92, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.stroke();
  ctx.fillStyle = "#0c0a16";
  ctx.font = `800 96px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.trim().slice(0, 1), W / 2, 112);
  // 이름 라벨
  ctx.font = `700 40px ${font}`;
  const label = name.length > 5 ? name.slice(0, 5) + "…" : name;
  const tw = ctx.measureText(label).width + 40;
  const ly = 262;
  ctx.fillStyle = "rgba(12,10,22,0.82)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - tw / 2, ly - 30, tw, 60, 30);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, W / 2, ly + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function Person({
  person,
  radius,
  ratio,
  onSelect,
}: {
  person: RelationRow;
  radius: number;
  ratio: number;
  onSelect?: (name: string) => void;
}) {
  const grp = useRef<THREE.Group>(null);
  const color = colorOf(person.sentiment);
  const tex = useMemo(() => personTexture(person.name, color), [person.name, color]);
  const p = useMemo(() => placementOf(person.name), [person.name]);
  const size = radius * ratio;
  const base = useMemo(() => placementToVec3(p, radius), [p, radius]);

  useFrame((state) => {
    if (!grp.current) return;
    const t = state.clock.elapsedTime * 0.9 + p.seed * Math.PI * 2;
    grp.current.position.copy(base).multiplyScalar(1 + (size * 0.55 + Math.sin(t) * size * 0.04) / radius);
  });

  if (!tex) return null;
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.(person.name);
  };
  return (
    <group ref={grp} position={base.toArray()}>
      <Billboard>
        <mesh onClick={click} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
          <planeGeometry args={[size, size * 1.25]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, size * 0.2, -0.001]}>
          <circleGeometry args={[size * 0.4, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </Billboard>
    </group>
  );
}

interface Props {
  radius: number;
  /** 마커 크기 (반지름 대비) */
  ratio?: number;
  onSelect?: (name: string) => void;
}

export function PlanetPeople({ radius, ratio = 0.3, onSelect }: Props) {
  const people = useRelationsStore((s) => s.people);
  const loaded = useRelationsStore((s) => s.loaded);
  const load = useRelationsStore((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  return (
    <group>
      {people.slice(0, 12).map((r) => (
        <Person key={r.id} person={r} radius={radius} ratio={ratio} onSelect={onSelect} />
      ))}
    </group>
  );
}
