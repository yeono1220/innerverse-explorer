// 메인 글래스 행성.
// 유리 외피 + 내부 영혼 구체(펄스) + 대기 셸 + 표면 형성물 + 모모.
// 드래그 회전(관성) + 키스토어 분기에 따라 색/표면 갱신.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore, BRANCH } from "@/pitch/store/emotionStore";
import { planetRot } from "./sharedRefs";
import { SurfaceFormations } from "./SurfaceFormations";
import { StageMomo } from "./StageMomo";

export function GlassPlanet() {
  const branch = useEmotionStore((s) => s.branch);
  const amount = useEmotionStore((s) => s.branchAmount);
  const emo = useEmotionStore((s) => s.emo);

  // Russell 순환모형: 5감정은 불연속 라벨이 아니라 2축 위의 정박점.
  // 누적 감정 '비율'에 따라 행성 색을 연속 블렌딩한다.
  const emoColors = useMemo(
    () => ({
      pos: new THREE.Color(BRANCH.bloom.tint), // 고양
      calm: new THREE.Color(BRANCH.calm.tint), // 평온
      ten: new THREE.Color(BRANCH.tense.tint), // 긴장
      sad: new THREE.Color(BRANCH.wither.tint), // 격앙
      emp: new THREE.Color(BRANCH.void.tint), // 침체
    }),
    [],
  );
  const targetCol = useMemo(() => {
    const c = new THREE.Color(0, 0, 0);
    let total = 0;
    (["pos", "calm", "ten", "sad", "emp"] as const).forEach((k) => {
      const w = Math.max(0, emo[k] || 0);
      total += w;
      c.r += emoColors[k].r * w;
      c.g += emoColors[k].g * w;
      c.b += emoColors[k].b * w;
    });
    if (total > 0) c.multiplyScalar(1 / total);
    else c.set(0x6f6f8f);
    return c;
  }, [emo, emoColors]);

  const grp = useRef<THREE.Group>(null);
  const shellMat = useRef<THREE.MeshStandardMaterial>(null);
  const atmoMat = useRef<THREE.MeshBasicMaterial>(null);
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

  // 초기 색 세팅 (이후 전환은 useFrame의 lerp가 담당)
  useEffect(() => {
    const c = targetCol.clone();
    shellMat.current?.color.copy(c);
    shellMat.current?.emissive.copy(c);
    atmoMat.current?.color.copy(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, dt) => {
    if (!grp.current) return;
    // 관성 자동 회전
    if (!planetRot.dragging) {
      planetRot.y += planetRot.velX;
      planetRot.velX *= 0.96;
      if (Math.abs(planetRot.velX) < 0.0016) planetRot.velX = 0.0016;
    }
    grp.current.rotation.y = planetRot.y;
    grp.current.rotation.x = planetRot.x;

    // 감정 분기 색으로 부드럽게 전환 (감정에 따라 행성 색이 바뀜)
    const k = Math.min(1, dt * 3);
    if (shellMat.current) {
      shellMat.current.color.lerp(targetCol, k);
      shellMat.current.emissive.lerp(targetCol, k);
      shellMat.current.emissiveIntensity = 0.16 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
    if (atmoMat.current) atmoMat.current.color.lerp(targetCol, k);
  });

  return (
    <group ref={grp}>
      {/* 본체 — flat-shaded 지오데식 (디오라마 결정면 룩). 색은 useFrame에서 lerp */}
      <mesh>
        <icosahedronGeometry args={[1.55, 3]} />
        <meshStandardMaterial
          ref={shellMat}
          flatShading
          roughness={0.5}
          metalness={0.1}
          emissiveIntensity={0.16}
        />
      </mesh>

      {/* 대기 글로우 셸 (additive) */}
      <mesh>
        <sphereGeometry args={[1.78, 48, 48]} />
        <meshBasicMaterial
          ref={atmoMat}
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 표면 형성물 */}
      <SurfaceFormations branch={branch} amount={amount} />

      {/* 성장 아바타 모모 (행성 표면에 얹힘) */}
      <group position={[0, 0, 1.62]} scale={0.6}>
        <StageMomo ownerSlot="momo" />
      </group>
    </group>
  );
}
