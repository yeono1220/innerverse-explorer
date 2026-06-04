// 재사용 가능한 3D "글래스 모모" 아이콘.
// 기존 앱의 GlassMomo 마스코트 + ProceduralEnv(유리 질감용 환경맵) + 조명을
// 독립 Canvas로 묶어, 랜딩/CTA 등 어디서나 3D 아이콘으로 쓸 수 있게 한다.
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";
import { ProceduralEnv } from "./ProceduralEnv";
import { GlassMomo } from "./GlassMomo";
import { GlassPlanet } from "./GlassPlanet";
import { StageMomo } from "./StageMomo";
import { useCurrentStage } from "./growthStages";

/** 얼굴이 정면을 유지하도록 ±각도로 부드럽게 흔드는 래퍼 (full spin 대신 sway). */
function Sway({ children, amp = 0.5, speed = 0.5 }: { children: ReactNode; amp?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * speed) * amp;
  });
  return <group ref={ref}>{children}</group>;
}

interface MomoOrbProps {
  className?: string;
  /**
   * "growth" = 7일 성장 단계 모모(기본, growthStages 연동),
   * "momo" = 기본 마스코트만(가벼움),
   * "planet" = 행성+모모(드래그 회전 가능).
   */
  variant?: "growth" | "momo" | "planet";
  scale?: number;
}

export function MomoOrb({ className, variant = "growth", scale = 2.1 }: MomoOrbProps) {
  // 단계가 바뀌면 StageMomo를 remount시켜 "자라나는" pop-in 연출.
  const stage = useCurrentStage();
  const camZ = variant === "planet" ? 6.4 : variant === "growth" ? 4.6 : 3.4;

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.1, camZ], fov: 42, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ProceduralEnv />
        <ambientLight color={0xb0a8e8} intensity={0.5} />
        <directionalLight color={0xffffff} intensity={1.6} position={[3, 4, 5]} />
        <directionalLight color={0xa394f7} intensity={1.0} position={[-4, -1, -3]} />
        {variant === "planet" ? (
          <GlassPlanet />
        ) : variant === "growth" ? (
          <group scale={1.5}>
            <StageMomo key={stage} />
          </group>
        ) : (
          <Sway>
            <group scale={scale}>
              <GlassMomo />
            </group>
          </Sway>
        )}
      </Canvas>
    </div>
  );
}
