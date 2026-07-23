// 공유 우주 배경 — 별필드(2레이어) + 성운(네뷸라) + 은하 코어 글로우.
// 랜딩 은하수(GalaxyExplorer)와 앱 씬(Scene)이 함께 사용한다.
import { useMemo } from "react";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

function Nebula() {
  const clouds = useMemo(
    () => [
      { p: [-4, 2, -12], r: 7, c: 0x6b4fd0, o: 0.1 },
      { p: [5, -2, -14], r: 8, c: 0xe87fb8, o: 0.08 },
      { p: [0, 1, -16], r: 10, c: 0x3aa0c8, o: 0.07 },
      { p: [-6, -3, -10], r: 5, c: 0x8a82a0, o: 0.08 },
    ],
    [],
  );
  return (
    <group>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.p[0], c.p[1], c.p[2]]}>
          <sphereGeometry args={[c.r, 24, 24]} />
          <meshBasicMaterial
            color={c.c}
            transparent
            opacity={c.o}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function GalaxyCore() {
  return (
    <mesh position={[0, 0, -9]}>
      <sphereGeometry args={[2.6, 32, 32]} />
      <meshBasicMaterial
        color={0xb8a0ff}
        transparent
        opacity={0.12}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

interface SpaceBackdropProps {
  /** 별필드 포함 여부 (기본 true) */
  stars?: boolean;
}

export function SpaceBackdrop({ stars = true }: SpaceBackdropProps) {
  return (
    <>
      {stars && (
        <>
          <Stars radius={60} depth={60} count={2600} factor={2.6} saturation={0} fade speed={0.5} />
          <Stars radius={24} depth={20} count={900} factor={3.2} saturation={0} fade speed={0.9} />
        </>
      )}
      <Nebula />
      <GalaxyCore />
    </>
  );
}
