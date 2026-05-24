// 카메라 위치/시선. solo/friend 모드 사이를 lerp으로 부드럽게 전환.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore } from "@/store/emotionStore";

const SOLO_POS = new THREE.Vector3(0, 0.3, 7);
const FRIEND_POS = new THREE.Vector3(2.0, 0.3, 8.4);
const SOLO_LOOK = new THREE.Vector3(0, 0, 0);
const FRIEND_LOOK = new THREE.Vector3(1.9, 0, 0);

export function CameraRig() {
  const { camera } = useThree();
  const friendMode = useEmotionStore((s) => s.friendMode);
  const tmp = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const want = friendMode ? FRIEND_POS : SOLO_POS;
    const look = friendMode ? FRIEND_LOOK : SOLO_LOOK;
    camera.position.lerp(want, Math.min(1, dt * 2.2));
    tmp.current.copy(look);
    camera.lookAt(tmp.current);
  });

  return null;
}
