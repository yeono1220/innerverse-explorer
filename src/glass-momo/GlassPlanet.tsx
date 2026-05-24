// 메인 글래스 행성.
// 유리 외피 + 내부 영혼 구체(펄스) + 대기 셸 + 표면 형성물 + 모모.
// 드래그 회전(관성) + 키스토어 분기에 따라 색/표면 갱신.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { planetRot } from "./sharedRefs";
import { SurfaceFormations } from "./SurfaceFormations";
import { GlassMomo } from "./GlassMomo";

export function GlassPlanet() {
  const branch = useEmotionStore((s) => s.branch);
  const amount = useEmotionStore((s) => s.branchAmount);
  const tint = BRANCH[branch].tint;
  const soulColor = BRANCH[branch].soul;

  const grp = useRef<THREE.Group>(null);
  const soulMat = useRef<THREE.MeshStandardMaterial>(null);
  const { gl } = useThree();

  // 캔버스 드래그 → 행성 회전 + 관성
  useEffect(() => {
    const el = gl.domElement;
    let px = 0;
    let py = 0;

    const onDown = (e: PointerEvent) => {
      planetRot.dragging = true;
      px = e.clientX;
      py = e.clientY;
      // 핀치/스크롤 보호
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!planetRot.dragging) return;
      const dx = (e.clientX - px) / 180;
      const dy = (e.clientY - py) / 180;
      planetRot.y += dx;
      planetRot.x = Math.max(-0.8, Math.min(0.8, planetRot.x + dy));
      planetRot.velX = dx * 0.4;
      px = e.clientX;
      py = e.clientY;
    };
    const onUp = () => {
      planetRot.dragging = false;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  useFrame((state) => {
    if (!grp.current) return;
    // 관성 자동 회전
    if (!planetRot.dragging) {
      planetRot.y += planetRot.velX;
      planetRot.velX *= 0.96;
      if (Math.abs(planetRot.velX) < 0.0016) planetRot.velX = 0.0016;
    }
    grp.current.rotation.y = planetRot.y;
    grp.current.rotation.x = planetRot.x;

    // 영혼 펄스
    if (soulMat.current) {
      const pulse = 0.9 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
      soulMat.current.emissiveIntensity = pulse;
    }
  });

  return (
    <group ref={grp}>
      {/* 외피 유리 */}
      <mesh>
        <icosahedronGeometry args={[1.55, 6]} />
        <meshPhysicalMaterial
          color={tint}
          metalness={0}
          roughness={0.08}
          transmission={0.9}
          thickness={1.4}
          ior={1.35}
          clearcoat={1}
          clearcoatRoughness={0.12}
          envMapIntensity={1.1}
          transparent
          attenuationColor={tint}
          attenuationDistance={2.2}
          emissive={tint}
          emissiveIntensity={0.06}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 내부 영혼 */}
      <mesh>
        <icosahedronGeometry args={[0.7, 4]} />
        <meshStandardMaterial
          ref={soulMat}
          color={soulColor}
          emissive={soulColor}
          emissiveIntensity={0.9}
          roughness={0.5}
        />
      </mesh>

      {/* 대기 셸 */}
      <mesh>
        <sphereGeometry args={[1.74, 48, 48]} />
        <meshBasicMaterial color={tint} transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>

      {/* 표면 형성물 */}
      <SurfaceFormations branch={branch} amount={amount} />

      {/* 모모 (행성 표면에 얹힘) */}
      <group position={[0, 0, 1.7]}>
        <GlassMomo ownerSlot="momo" />
      </group>
    </group>
  );
}
