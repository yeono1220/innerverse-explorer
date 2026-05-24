// 글래스 모모 캐릭터.
// 달걀형 유리 바디 + 내부 발광 영혼 코어 + 검은 점 눈.
// idle bob + squash/stretch + hop(상호작용 시 통통).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { sharedRefs } from "./sharedRefs";

interface Props {
  // 친구 모드용 분홍 모모는 별도 색
  tintOverride?: number;
  // 어느 슬롯에 월드 위치 기록할지
  ownerSlot?: "momo" | "friend";
}

export function GlassMomo({ tintOverride, ownerSlot = "momo" }: Props) {
  const branch = useEmotionStore((s) => s.branch);
  const hopTick = useEmotionStore((s) => s.hopTick);
  const soul = tintOverride ?? BRANCH[branch].soul;

  const grp = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const hopAmt = useRef(0);
  const lastTick = useRef(hopTick);
  const tmpV = useRef(new THREE.Vector3());

  // 친구 모모는 friendMode/hopTick 트리거 무시 (구분 위해)
  const ownsHop = ownerSlot === "momo";

  useFrame((state, dt) => {
    if (!grp.current || !body.current) return;
    const t = state.clock.elapsedTime;
    const bob = Math.sin(t * 1.6) * 0.05;
    const sq = Math.sin(t * 1.6) * 0.025;
    // base scale 0.82 * (1±sq) for x/z, 1 * (1∓sq) for y → 달걀형 + 호흡감
    body.current.scale.set(0.82 * (1 + sq), 1 * (1 - sq), 0.82 * (1 + sq));

    if (ownsHop && hopTick !== lastTick.current) {
      hopAmt.current = 1;
      lastTick.current = hopTick;
    }
    if (hopAmt.current > 0) {
      hopAmt.current = Math.max(0, hopAmt.current - dt * 2.5);
    }
    const hopY = hopAmt.current > 0 ? Math.sin((1 - hopAmt.current) * Math.PI) * 0.3 : 0;
    grp.current.position.y = bob + hopY;

    // 월드 위치 공유
    grp.current.getWorldPosition(tmpV.current);
    if (ownerSlot === "momo") sharedRefs.momoWorldPos.copy(tmpV.current);
    else sharedRefs.friendMomoWorldPos.copy(tmpV.current);
  });

  return (
    <group ref={grp}>
      {/* 글래스 바디 (달걀형) */}
      <mesh ref={body}>
        <sphereGeometry args={[0.42, 64, 64]} />
        <meshPhysicalMaterial
          color={"#ffffff"}
          metalness={0}
          roughness={0.05}
          transmission={0.82}
          thickness={0.9}
          ior={1.35}
          clearcoat={1}
          clearcoatRoughness={0.12}
          envMapIntensity={1.1}
          transparent
          opacity={0.98}
          attenuationColor={"#ffffff"}
          attenuationDistance={1.6}
          emissive={"#eae6ff"}
          emissiveIntensity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 내부 영혼 코어 (감정색) */}
      <mesh>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial color={soul} emissive={soul} emissiveIntensity={1.1} roughness={0.4} />
      </mesh>

      {/* 눈 */}
      <mesh position={[-0.12, 0.05, 0.39]}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshBasicMaterial color={"#1a1a1a"} />
      </mesh>
      <mesh position={[0.12, 0.05, 0.39]}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshBasicMaterial color={"#1a1a1a"} />
      </mesh>
    </group>
  );
}
