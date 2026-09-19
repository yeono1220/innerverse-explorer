// 구매한 아이템이 행성 표면 어디에 놓일지 — 위치 생성/좌표 변환 단일 출처.
// 홈 행성(반지름 0.6)과 /glass 행성(반지름 1.56)이 같은 좌표를 공유하므로,
// 한 번 정해진 자리는 두 화면에서 동일하게 보인다.
import * as THREE from "three";

export interface ItemPlacement {
  /** InventoryItem.id */
  itemId: string;
  /** 위도 (rad, -π/2 ~ π/2). 극지방은 모모가 서 있어 피한다. */
  lat: number;
  /** 경도 (rad, 0 ~ 2π) */
  lon: number;
  /** 0~1. 크기·기울기·흔들림 위상 변주용 */
  seed: number;
}

/** 모모가 서 있는 지점(글래스 행성 기준 정면 [0,0,R]) — 여기엔 놓지 않는다. */
const MOMO_LAT = 0;
const MOMO_LON = Math.PI / 2;
/** 모모 주변 확보 반경(rad) */
const MOMO_CLEARANCE = 0.55;
/** 아이템끼리의 최소 간격(rad) */
const MIN_GAP = 0.42;
/** 극지방 회피 — 홈 행성은 북극에 모모가 서 있다. */
const LAT_LIMIT = 0.85;

/** 단위구 위 두 점(위도/경도)의 대원 각거리(rad). */
function angularDist(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const d =
    Math.sin(a.lat) * Math.sin(b.lat) +
    Math.cos(a.lat) * Math.cos(b.lat) * Math.cos(a.lon - b.lon);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/**
 * 이미 놓인 것들과 겹치지 않는 랜덤 자리 하나를 뽑는다.
 * 후보를 여러 번 던져보고 전부 실패하면(자리가 빽빽하면) 마지막 후보를 그대로 쓴다.
 */
export function randomPlacement(itemId: string, existing: ItemPlacement[]): ItemPlacement {
  let last = { lat: 0, lon: 0 };
  for (let i = 0; i < 40; i += 1) {
    // sin 분포로 뽑아야 구 표면에 고르게 흩어진다.
    const lat = Math.asin(Math.random() * 2 - 1) * (LAT_LIMIT / (Math.PI / 2));
    const lon = Math.random() * Math.PI * 2;
    last = { lat, lon };
    if (angularDist(last, { lat: MOMO_LAT, lon: MOMO_LON }) < MOMO_CLEARANCE) continue;
    if (existing.some((p) => angularDist(last, p) < MIN_GAP)) continue;
    break;
  }
  return { itemId, lat: last.lat, lon: last.lon, seed: Math.random() };
}

/** 위도/경도 → 반지름 r 구면 위의 3D 좌표. GlassPlanet의 표면 형성물과 같은 규칙. */
export function placementToVec3(p: { lat: number; lon: number }, r: number): THREE.Vector3 {
  return new THREE.Vector3(
    r * Math.cos(p.lat) * Math.cos(p.lon),
    r * Math.sin(p.lat),
    r * Math.cos(p.lat) * Math.sin(p.lon),
  );
}

/** 저장된 값이 깨져 있어도 앱이 죽지 않도록 정규화. */
export function normalizePlacement(v: unknown): ItemPlacement | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.itemId !== "string" || !o.itemId) return null;
  const num = (x: unknown, fb: number) => (typeof x === "number" && Number.isFinite(x) ? x : fb);
  return {
    itemId: o.itemId,
    lat: num(o.lat, 0),
    lon: num(o.lon, 0),
    seed: num(o.seed, 0.5),
  };
}
