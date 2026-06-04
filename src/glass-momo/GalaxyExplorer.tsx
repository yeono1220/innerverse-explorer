// 은하수(행성 탐사) 3D.
// flat-shaded 지오데식(면이 쪼개지는) 감정 행성들 + 성운(네뷸라) + 짙은 별필드.
// 행성은 작게, 공간은 넓게 — 진짜 우주를 탐험하는 느낌.
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { SpaceBackdrop } from "./SpaceBackdrop";

interface PlanetDef {
  position: [number, number, number];
  size: number;
  tint: number;
  detail: number; // icosahedron 분할 (작을수록 면이 큼)
  spin: number;
  bob: number;
  phase: number;
}

// 앱 BRANCH 팔레트 (만개/평온/긴장/시듦/공허 + 친구 분홍)
const PLANETS: PlanetDef[] = [
  { position: [0, 0.1, 0], size: 0.62, tint: 0xe87fb8, detail: 3, spin: 0.16, bob: 0.1, phase: 0 }, // 중앙 = 방문 대상(친구)
  { position: [-3.6, 1.4, -2.5], size: 0.34, tint: 0x5fc88a, detail: 2, spin: 0.3, bob: 0.16, phase: 1.1 },
  { position: [3.7, 1.1, -2.0], size: 0.4, tint: 0x6f9ae8, detail: 3, spin: -0.24, bob: 0.15, phase: 2.3 },
  { position: [-3.0, -1.9, -1.0], size: 0.26, tint: 0xd99a4e, detail: 2, spin: 0.34, bob: 0.18, phase: 3.0 },
  { position: [3.1, -1.8, -1.4], size: 0.3, tint: 0x8a82a0, detail: 2, spin: -0.3, bob: 0.16, phase: 4.2 },
  { position: [-5.0, -0.3, -4.0], size: 0.22, tint: 0x8a6f6a, detail: 1, spin: 0.28, bob: 0.12, phase: 5.1 },
  { position: [5.1, 0.2, -3.6], size: 0.24, tint: 0x5fc88a, detail: 2, spin: -0.26, bob: 0.13, phase: 0.7 },
];

function Planet({ def }: { def: PlanetDef }) {
  const grp = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (spinner.current) spinner.current.rotation.y += dt * def.spin;
    if (grp.current) grp.current.position.y = def.position[1] + Math.sin(t * 0.7 + def.phase) * def.bob;
  });
  const s = def.size;
  return (
    <group ref={grp} position={def.position}>
      <group ref={spinner}>
        {/* flat-shaded 지오데식 본체 (면이 쪼개지는 룩) */}
        <mesh>
          <icosahedronGeometry args={[s, def.detail]} />
          <meshStandardMaterial
            color={def.tint}
            flatShading
            roughness={0.55}
            metalness={0.08}
            emissive={def.tint}
            emissiveIntensity={0.14}
          />
        </mesh>
      </group>
      {/* 대기 글로우 셸 (additive) */}
      <mesh>
        <sphereGeometry args={[s * 1.22, 24, 24]} />
        <meshBasicMaterial
          color={def.tint}
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** 전체 은하를 아주 느리게 회전시켜 탐험감을 준다. */
function GalaxyGroup() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.07) * 0.3;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.045) * 0.06;
    }
  });
  return (
    <group ref={ref}>
      {PLANETS.map((def, i) => (
        <Planet key={i} def={def} />
      ))}
    </group>
  );
}

export function GalaxyExplorer({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.3, 10.5], fov: 48, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <SpaceBackdrop />
        <ambientLight color={0x8a86b8} intensity={0.55} />
        <directionalLight color={0xffffff} intensity={1.5} position={[3, 4, 5]} />
        <directionalLight color={0xa394f7} intensity={0.9} position={[-4, -1, -3]} />
        <pointLight color={0xb8a0ff} intensity={1.2} distance={20} position={[0, 0, -6]} />
        <GalaxyGroup />
      </Canvas>
    </div>
  );
}
