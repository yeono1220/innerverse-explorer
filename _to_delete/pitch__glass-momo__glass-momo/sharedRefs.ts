// R3F 컴포넌트 간에 자주 갱신되는 값을 React state 거치지 않고 공유하기 위한 모듈 단일톤.
// 행성 회전(드래그 관성), 모모 월드 위치(파티클 시작점) 등.
import * as THREE from "three";

export const planetRot = {
  x: 0.12,
  y: 0,
  velX: 0.0016,
  dragging: false,
};

export function resetPlanetRot() {
  planetRot.x = 0.12;
  planetRot.y = 0;
  planetRot.velX = 0.0016;
}

export const sharedRefs = {
  momoWorldPos: new THREE.Vector3(0, 0, 1.7),
  friendMomoWorldPos: new THREE.Vector3(4.2, 0, 1.7 * 0.78),
};
