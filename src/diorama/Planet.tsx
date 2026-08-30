// 소혹성 본체 — 로우폴리 결정면 구체 + 내부 글래스 영혼 코어.
// 색은 5감정 비율(emotionStore.emo)로 연속 블렌딩(옛 experience 방식).
// 산책 모드: 방향키가 행성을 굴려 '고정된 모모' 발밑으로 지형이 흐른다.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useDioramaStore } from "./dioramaStore";
import { PLANET_RADIUS } from "./constants";
import { planetRot, walkInput } from "@/glass-momo/sharedRefs";
import { useEmotionStore, BRANCH, EMO7, type Emo7 } from "@/store/emotionStore";
import { Structures } from "./Structures";
import { Momo } from "./Momo";

// 7감정 → 행성 색(분기 tint). 감정 비율로 연속 블렌딩.
const EMO_TINT: Record<Emo7, THREE.Color> = {
  joy: new THREE.Color(BRANCH.bloom.tint),
  calm: new THREE.Color(BRANCH.calm.tint),
  love: new THREE.Color(BRANCH.love.tint),
  sad: new THREE.Color(BRANCH.wither.tint),
  anger: new THREE.Color(BRANCH.rage.tint),
  tension: new THREE.Color(BRANCH.tense.tint),
  empty: new THREE.Color(BRANCH.void.tint),
};

export function Planet() {
  const grp = useRef<THREE.Group>(null);
  const surfaceMat = useRef<THREE.MeshStandardMaterial>(null);
  const coreMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const atmoMat = useRef<THREE.MeshBasicMaterial>(null);
  const { gl } = useThree();
  const mode = useDioramaStore((s) => s.cameraMode);
  const emo = useEmotionStore((s) => s.emo);

  // 감정 비율 → 행성 색 (가중 블렌딩)
  const targetCol = useMemo(() => {
    const c = new THREE.Color(0, 0, 0);
    let total = 0;
    EMO7.forEach((k) => {
      const w = Math.max(0, emo[k] || 0);
      total += w;
      c.r += EMO_TINT[k].r * w;
      c.g += EMO_TINT[k].g * w;
      c.b += EMO_TINT[k].b * w;
    });
    if (total > 0) c.multiplyScalar(1 / total);
    else c.set(0x6f6f8f);
    return c;
  }, [emo]);
  const hiCol = useMemo(() => targetCol.clone().lerp(new THREE.Color(1, 1, 1), 0.45), [targetCol]);

  // 드래그 회전 (포인터 캡처 + 관성)
  useEffect(() => {
    const el = gl.domElement;
    let px = 0;
    let py = 0;
    const onDown = (e: PointerEvent) => {
      planetRot.dragging = true;
      px = e.clientX;
      py = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!planetRot.dragging) return;
      const dx = (e.clientX - px) / 180;
      const dy = (e.clientY - py) / 180;
      planetRot.y += dx;
      planetRot.x += dy;
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

  // 로우폴리 + 약한 displacement (지형감)
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(PLANET_RADIUS, 4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = Math.sin(v.x * 3.1) * Math.cos(v.y * 2.7) * Math.sin(v.z * 2.3) * 0.04;
      v.multiplyScalar(1 + n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame((_, dt) => {
    if (!grp.current) return;
    const sp = 1.4 * Math.min(dt, 0.05);

    // 산책: 방향키로 행성을 굴림 (모모는 고정 → 발밑 지형이 흐름). 전진은 무한 회전(clamp X).
    if (mode === "walk") {
      planetRot.y += walkInput.x * sp;
      planetRot.x += walkInput.y * sp;
    }
    if (!planetRot.dragging) {
      planetRot.y += planetRot.velX;
      planetRot.velX *= 0.94;
      if (Math.abs(planetRot.velX) < 0.0002) planetRot.velX = 0;
    }
    grp.current.rotation.y = planetRot.y;
    grp.current.rotation.x = planetRot.x;

    // 감정 색 부드럽게 전환
    const k = Math.min(1, dt * 2.5);
    surfaceMat.current?.color.lerp(targetCol, k);
    if (coreMat.current) {
      coreMat.current.color.lerp(hiCol, k);
      coreMat.current.emissive.lerp(hiCol, k);
    }
    atmoMat.current?.color.lerp(targetCol, k);
  });

  return (
    <group>
      {/* 회전하는 행성 본체 + 표면 구조물 */}
      <group ref={grp}>
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial ref={surfaceMat} color={targetCol} roughness={0.78} metalness={0.05} flatShading />
        </mesh>

        <mesh>
          <icosahedronGeometry args={[0.42, 3]} />
          <meshPhysicalMaterial
            ref={coreMat}
            color={hiCol}
            emissive={hiCol}
            emissiveIntensity={0.85}
            transmission={0.55}
            thickness={0.6}
            ior={1.4}
            roughness={0.18}
            clearcoat={1}
            transparent
          />
        </mesh>

        <mesh>
          <sphereGeometry args={[PLANET_RADIUS * 1.07, 32, 32]} />
          <meshBasicMaterial ref={atmoMat} color={targetCol} transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>

        <Structures />
      </group>

      {/* 모모는 회전 그룹 밖 — 화면에 고정, 행성만 굴러간다 */}
      <Momo />
    </group>
  );
}
