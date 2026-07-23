// 친구 모드용 분홍 행성 + 분홍 모모.
// 평온(calm) 분기 고정. 천천히 자전.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore } from "@/pitch/store/emotionStore";
import { SurfaceFormations } from "./SurfaceFormations";
import { GlassMomo } from "./GlassMomo";

const PINK = 0xe87fb8;
const PINK_SOUL = 0xf3a5cc;

export function FriendPlanet() {
  const friendMode = useEmotionStore((s) => s.friendMode);
  const grp = useRef<THREE.Group>(null);
  const shellMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, dt) => {
    if (!grp.current) return;
    grp.current.rotation.y -= 0.004;
    if (shellMat.current) {
      shellMat.current.emissiveIntensity = 0.16 + Math.sin(state.clock.elapsedTime * 2 + 0.7) * 0.1;
    }
  });

  if (!friendMode) return null;

  return (
    <group ref={grp} position={[4.2, 0, 0]} scale={0.78}>
      {/* 본체 — flat-shaded 지오데식 (디오라마 결정면 룩) */}
      <mesh>
        <icosahedronGeometry args={[1.55, 3]} />
        <meshStandardMaterial
          ref={shellMat}
          color={PINK}
          flatShading
          roughness={0.5}
          metalness={0.1}
          emissive={PINK}
          emissiveIntensity={0.16}
        />
      </mesh>
      {/* 대기 글로우 셸 (additive) */}
      <mesh>
        <sphereGeometry args={[1.78, 48, 48]} />
        <meshBasicMaterial
          color={PINK}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <SurfaceFormations branch="calm" amount={0.6} />
      <group position={[0, 0, 1.7]}>
        <GlassMomo ownerSlot="friend" tintOverride={PINK_SOUL} />
      </group>
    </group>
  );
}
