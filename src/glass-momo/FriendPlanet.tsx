// 친구 모드용 분홍 행성 + 분홍 모모.
// 평온(calm) 분기 고정. 천천히 자전.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore } from "@/store/emotionStore";
import { SurfaceFormations } from "./SurfaceFormations";
import { GlassMomo } from "./GlassMomo";

const PINK = 0xe87fb8;
const PINK_SOUL = 0xf3a5cc;

export function FriendPlanet() {
  const friendMode = useEmotionStore((s) => s.friendMode);
  const grp = useRef<THREE.Group>(null);
  const soulMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, dt) => {
    if (!grp.current) return;
    grp.current.rotation.y -= 0.004;
    if (soulMat.current) {
      const pulse = 0.9 + Math.sin(state.clock.elapsedTime * 2 + 0.7) * 0.15;
      soulMat.current.emissiveIntensity = pulse;
    }
  });

  if (!friendMode) return null;

  return (
    <group ref={grp} position={[4.2, 0, 0]} scale={0.78}>
      <mesh>
        <icosahedronGeometry args={[1.55, 6]} />
        <meshPhysicalMaterial
          color={PINK}
          metalness={0}
          roughness={0.08}
          transmission={0.9}
          thickness={1.4}
          ior={1.35}
          clearcoat={1}
          clearcoatRoughness={0.12}
          envMapIntensity={1.1}
          transparent
          attenuationColor={PINK}
          attenuationDistance={2.2}
          emissive={PINK}
          emissiveIntensity={0.06}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.7, 4]} />
        <meshStandardMaterial
          ref={soulMat}
          color={PINK_SOUL}
          emissive={PINK_SOUL}
          emissiveIntensity={0.9}
          roughness={0.5}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.74, 48, 48]} />
        <meshBasicMaterial color={PINK} transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
      <SurfaceFormations branch="calm" amount={0.6} />
      <group position={[0, 0, 1.7]}>
        <GlassMomo ownerSlot="friend" tintOverride={PINK_SOUL} />
      </group>
    </group>
  );
}
