import { describe, it, expect } from "vitest";
import { normalizePlacement, placementToVec3, randomPlacement, type ItemPlacement } from "./placement";

describe("randomPlacement", () => {
  it("행성 표면 위(극지방 제외)에 놓인다", () => {
    for (let i = 0; i < 200; i += 1) {
      const p = randomPlacement("i1", []);
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(0.86);
      expect(p.lon).toBeGreaterThanOrEqual(0);
      expect(p.lon).toBeLessThan(Math.PI * 2);
    }
  });

  it("모모가 서 있는 정면([0,0,R])을 피한다", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = placementToVec3(randomPlacement("i1", []), 1.56);
      const momo = placementToVec3({ lat: 0, lon: Math.PI / 2 }, 1.56);
      expect(v.distanceTo(momo)).toBeGreaterThan(0.6);
    }
  });

  it("좌표는 항상 반지름 위에 있다", () => {
    const v = placementToVec3(randomPlacement("i1", []), 0.6);
    expect(v.length()).toBeCloseTo(0.6, 5);
  });

  it("이미 놓인 아이템과 겹치지 않는다", () => {
    const placed: ItemPlacement[] = [];
    for (let i = 0; i < 6; i += 1) placed.push(randomPlacement(`i${i}`, placed));
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        const d = placementToVec3(placed[a], 1).distanceTo(placementToVec3(placed[b], 1));
        expect(d).toBeGreaterThan(0.3);
      }
    }
  });
});

describe("normalizePlacement", () => {
  it("깨진 값은 버리거나 기본값으로 채운다", () => {
    expect(normalizePlacement(null)).toBeNull();
    expect(normalizePlacement({ lat: 1 })).toBeNull();
    expect(normalizePlacement({ itemId: "i1", lat: "x", lon: 2, seed: null })).toEqual({
      itemId: "i1",
      lat: 0,
      lon: 2,
      seed: 0.5,
    });
  });
});
