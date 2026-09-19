// 홈/레벨업용 작은 3D 무대 — 행성 곡면 위에 현재 단계의 모모가 서 있는 컷.
// 디오라마 화면과 같은 MomoCharacter를 그대로 사용해서 디자인 일관성 유지.
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { MomoCharacter } from "@/diorama/MomoCharacter";
import { useCurrentStage } from "@/diorama/growth";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { useUserStore, PLANET_COLORS, type PlanetColor } from "@/store/userStore";
import { PlanetItems } from "@/planet-items/PlanetItems";

interface Props {
  size?: number;
  onClick?: () => void;
  /** 행성 색을 강제 지정 (생략 시 user.planetColor) */
  color?: PlanetColor;
  /** "rotating" 자체 회전 애니메이션 사용 (레벨업 화면 등) */
  rotating?: boolean;
}

export function HomeAvatarStage({ size = 200, onClick, color, rotating }: Props) {
  const userColor = useUserStore((s) => s.planetColor);
  const tone = PLANET_COLORS[color ?? userColor];
  const stage = useCurrentStage();
  const branch = useEmotionStore((s) => s.branch);
  const soul = useMemo(
    () => "#" + BRANCH[branch].soul.toString(16).padStart(6, "0"),
    [branch],
  );

  // 행성 표면 노이즈 (살짝의 지형감). 메인 행성 반지름 0.6 로 축소.
  const planetGeo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.6, 4);
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

  return (
    <button
      onClick={onClick}
      className="iv-homestage"
      aria-label="모모 행성"
      style={{
        width: size,
        height: size,
        background: "none",
        border: "none",
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        borderRadius: "50%",
      }}
    >
      {/* 행성 글로우 (배경) */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -size * 0.08,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 60%, ${tone.glow}, transparent 65%)`,
          filter: "blur(8px)",
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />
      <Canvas
        camera={{ position: [0, 0.35, 3.0], fov: 36 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight color={0xb8b0e8} intensity={0.55} />
        <directionalLight color={0xffffff} intensity={1.3} position={[2.5, 3.5, 4]} />
        <directionalLight color={0xa394f7} intensity={0.6} position={[-3, -1, -2]} />

        {/* 행성 본체 */}
        <PlanetWithMomo
          geo={planetGeo}
          tone={tone}
          soul={soul}
          stage={stage}
          rotating={!!rotating}
        />
      </Canvas>
    </button>
  );
}

function PlanetWithMomo({
  geo,
  tone,
  soul,
  stage,
  rotating,
}: {
  geo: THREE.IcosahedronGeometry;
  tone: (typeof PLANET_COLORS)[PlanetColor];
  soul: string;
  stage: ReturnType<typeof useCurrentStage>;
  rotating: boolean;
}) {
  // 행성 + 모모를 하나의 group으로 묶어 같이 회전 (있다면)
  const grpRef = useGroupRotation(rotating ? 0.35 : 0);

  return (
    <group ref={grpRef}>
      {/* 행성 표면 */}
      <mesh geometry={geo}>
        <meshStandardMaterial color={tone.mid} roughness={0.78} metalness={0.05} flatShading />
      </mesh>

      {/* 내부 글래스 코어 (행성 0.6 비례) */}
      <mesh>
        <icosahedronGeometry args={[0.2, 2]} />
        <meshPhysicalMaterial
          color={tone.hi}
          emissive={tone.hi}
          emissiveIntensity={0.75}
          transmission={0.55}
          thickness={0.5}
          ior={1.4}
          roughness={0.18}
          clearcoat={1}
          transparent
        />
      </mesh>

      {/* 대기 (행성 0.6 비례) */}
      <mesh>
        <sphereGeometry args={[0.64, 32, 32]} />
        <meshBasicMaterial color={tone.mid} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      {/* 인벤토리에서 구매한 아이템 — /glass 행성과 같은 자리에 놓인다 */}
      <PlanetItems radius={0.6} ratio={0.34} />

      {/* 행성 표면 위 모모 — 새 표면 (0.6) 위에 살짝 띄움 */}
      <group position={[0, 0.6, 0]}>
        <MomoStanding stage={stage} soul={soul} />
      </group>
    </group>
  );
}

function MomoStanding({ stage, soul }: { stage: ReturnType<typeof useCurrentStage>; soul: string }) {
  // MomoCharacter는 자체 호흡 애니메이션. 표면에 살짝 띄움.
  return (
    <group position={[0, 0.05, 0]} scale={1.2}>
      <MomoCharacter stage={stage} soulColor={soul} />
    </group>
  );
}

// 그룹 회전 helper
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
function useGroupRotation(speed: number) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * (speed || 0.12); // 기본도 아주 천천히
  });
  return ref;
}
