// R3F 컴포넌트 간에 자주 갱신되는 값을 React state 거치지 않고 공유하기 위한 모듈 단일톤.
// 행성 회전(드래그 관성), 모모 월드 위치(파티클 시작점) 등.
import * as THREE from "three";

export const planetRot = {
  x: 0, //0.12
  y: 0,
  velX: 0, //0.0016
  dragging: false,
};

export function resetPlanetRot() {
  planetRot.x = 0; //0.12
  planetRot.y = 0;
  planetRot.velX = 0; //0.0016
}

export const sharedRefs = {
  momoWorldPos: new THREE.Vector3(0, 0, 1.7),
  // 모모의 월드 진행방향(표면 접선) — 3인칭 카메라가 뒤통수에 붙도록 사용.
  momoWorldFwd: new THREE.Vector3(0, 1, 0),
  friendMomoWorldPos: new THREE.Vector3(4.2, 0, 1.7 * 0.78),
};

// 산책 이동 입력 — d-pad / 방향키가 갱신, Momo가 매 프레임 표면 위 위치/방향으로 반영.
// x: 좌(-1)/우(+1) 회전(턴), y: 앞(+1)/뒤(-1) 이동
export const walkInput = { x: 0, y: 0 };
