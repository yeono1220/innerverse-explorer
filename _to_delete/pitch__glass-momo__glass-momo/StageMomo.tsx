// 7일 성장 단계 모모 — growthStages.ts의 StageSpec을 3D로 렌더.
// 본체(유리) + 영혼 코어 + 단계별 장식(눈/뺨/팔/새싹/꽃잎/후광/왕관/망토/오라).
// 모든 파트는 본체 반경 r에 비례 배치 → 단계가 커지면 장식도 함께 커진다.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STAGES, useCurrentStage, type StageSpec } from "./growthStages";
import { sharedRefs } from "./sharedRefs";

const BODY_BASE = 0.5; // 본체 sphere 기준 반경 (bodyScale 배율의 기준)
const CORE_BASE = 0.2; // 영혼 코어 기준 반경 (coreScale 배율의 기준)

function lighten(hex: string, amt = 0.4): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), amt);
}

function Petals({ r, color }: { r: number; color: THREE.Color }) {
  // 머리 둘레 4개 꽃잎 (납작한 타원체)
  const ring = r * 0.78;
  const y = r * 0.86;
  return (
    <group>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * ring, y, Math.sin(a) * ring]}
            rotation={[0, -a, 0.5]}
            scale={[r * 0.34, r * 0.1, r * 0.2]}
          >
            <sphereGeometry args={[1, 18, 18]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

function Crown({ r }: { r: number }) {
  // 머리 위 별 3개 (octahedron)
  const y = r * 1.32;
  const gold = "#ffe08a";
  return (
    <group>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[k * r * 0.42, y + (k === 0 ? r * 0.12 : 0), 0]} rotation={[0.3, 0.4, 0]}>
          <octahedronGeometry args={[r * 0.13, 0]} />
          <meshStandardMaterial color={gold} emissive={gold} emissiveIntensity={1.2} roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export function StageMomo({ ownerSlot = "momo" }: { ownerSlot?: "momo" | "friend" } = {}) {
  const stage = useCurrentStage();
  const spec: StageSpec = STAGES[stage];

  const r = BODY_BASE * spec.bodyScale;
  const coreR = CORE_BASE * spec.coreScale;
  const bodyColor = useMemo(() => new THREE.Color(spec.swatch), [spec.swatch]);
  const coreColor = useMemo(() => lighten(spec.swatch, 0.45), [spec.swatch]);
  const cheekColor = useMemo(() => new THREE.Color("#ff9fc4"), []);
  const petalColor = useMemo(() => lighten(spec.swatch, 0.2), [spec.swatch]);
  const capeColor = useMemo(() => new THREE.Color(spec.swatch).multiplyScalar(0.7), [spec.swatch]);

  const grp = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const aura = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0.001); // 등장/단계전환 시 부드러운 pop-in
  const tmpV = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    if (!grp.current || !body.current) return;
    const t = state.clock.elapsedTime;

    // 전체 bob + sway (얼굴 정면 유지)
    grp.current.position.y = Math.sin(t * 1.5) * 0.05;
    grp.current.rotation.y = Math.sin(t * 0.5) * 0.45;

    // 호흡 (달걀형 squash/stretch)
    const sq = Math.sin(t * 1.6) * 0.025;
    body.current.scale.set(0.92 * (1 + sq), 1 * (1 - sq), 0.92 * (1 + sq));

    // pop-in: 단계가 바뀌면 scaleRef를 살짝 줄여 다시 차오르게 (StageMomo는 key로 remount)
    scaleRef.current = THREE.MathUtils.damp(scaleRef.current, 1, 6, dt);
    grp.current.scale.setScalar(scaleRef.current);

    // 코어 펄스
    if (coreMat.current) {
      coreMat.current.emissiveIntensity = 1.0 + Math.sin(t * 2.4) * 0.25;
    }
    // 후광 회전
    if (halo.current) halo.current.rotation.z = t * 0.6;
    // 오라 은은한 맥동
    if (aura.current) {
      const m = aura.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.07 + (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.05;
    }

    // 친구 모드 감정선(FriendStreaks)용 월드 위치 공유
    grp.current.getWorldPosition(tmpV.current);
    if (ownerSlot === "momo") sharedRefs.momoWorldPos.copy(tmpV.current);
    else sharedRefs.friendMomoWorldPos.copy(tmpV.current);
  });

  return (
    <group ref={grp}>
      {/* 본체 (유리) */}
      <mesh ref={body}>
        <sphereGeometry args={[r, 64, 64]} />
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={0}
          roughness={0.06}
          transmission={0.8}
          thickness={0.9}
          ior={1.35}
          clearcoat={1}
          clearcoatRoughness={0.12}
          envMapIntensity={1.1}
          transparent
          opacity={0.98}
          attenuationColor={bodyColor}
          attenuationDistance={1.6}
          emissive={bodyColor}
          emissiveIntensity={spec.bodyEmissive}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 영혼 코어 */}
      <mesh>
        <sphereGeometry args={[coreR, 32, 32]} />
        <meshStandardMaterial ref={coreMat} color={coreColor} emissive={coreColor} emissiveIntensity={1} roughness={0.4} />
      </mesh>

      {/* 눈 */}
      {spec.showEyes && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 0.3, r * 0.12, r * 0.9]}>
              <sphereGeometry args={[r * 0.1, 16, 16]} />
              <meshBasicMaterial color={"#1a1a1a"} />
            </mesh>
          ))}
        </group>
      )}

      {/* 뺨 홍조 */}
      {spec.showCheeks && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 0.5, -r * 0.02, r * 0.82]} scale={[1, 0.7, 0.5]}>
              <sphereGeometry args={[r * 0.13, 16, 16]} />
              <meshBasicMaterial color={cheekColor} transparent opacity={0.55} />
            </mesh>
          ))}
        </group>
      )}

      {/* 팔 (작은 유리 구체) */}
      {spec.showArms && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (r + r * 0.18), -r * 0.15, 0]}>
              <sphereGeometry args={[r * 0.2, 24, 24]} />
              <meshPhysicalMaterial
                color={bodyColor}
                roughness={0.1}
                transmission={0.7}
                thickness={0.5}
                ior={1.3}
                clearcoat={1}
                envMapIntensity={1.1}
                transparent
                emissive={bodyColor}
                emissiveIntensity={spec.bodyEmissive * 0.8}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 새싹 (줄기 + 떡잎) */}
      {spec.showSprout && (
        <group position={[0, r * 1.02, 0]}>
          <mesh position={[0, r * 0.12, 0]}>
            <cylinderGeometry args={[r * 0.04, r * 0.05, r * 0.28, 8]} />
            <meshStandardMaterial color={"#6fce8f"} emissive={"#3a8a55"} emissiveIntensity={0.3} roughness={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 0.12, r * 0.26, 0]} rotation={[0, 0, s * 0.7]} scale={[1, 0.55, 0.4]}>
              <sphereGeometry args={[r * 0.13, 16, 16]} />
              <meshStandardMaterial color={"#7fd6a0"} emissive={"#4aa06a"} emissiveIntensity={0.35} roughness={0.45} />
            </mesh>
          ))}
        </group>
      )}

      {/* 꽃잎 머리띠 */}
      {spec.showPetals && <Petals r={r} color={petalColor} />}

      {/* 후광 토러스 */}
      {spec.showHalo && (
        <mesh ref={halo} position={[0, r * 1.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.72, r * 0.05, 16, 48]} />
          <meshStandardMaterial color={"#ffe7a3"} emissive={"#ffd97a"} emissiveIntensity={1.4} roughness={0.3} metalness={0.3} />
        </mesh>
      )}

      {/* 별 왕관 */}
      {spec.showCrown && <Crown r={r} />}

      {/* 망토 (콘) */}
      {spec.showCape && (
        <mesh position={[0, -r * 0.1, -r * 0.55]} rotation={[0.32, 0, 0]}>
          <coneGeometry args={[r * 0.95, r * 1.7, 28, 1, true]} />
          <meshStandardMaterial
            color={capeColor}
            emissive={capeColor}
            emissiveIntensity={0.3}
            roughness={0.4}
            metalness={0.1}
            side={THREE.DoubleSide}
            transparent
            opacity={0.92}
          />
        </mesh>
      )}

      {/* 바깥 오라 셸 */}
      {spec.showAura && (
        <mesh ref={aura}>
          <sphereGeometry args={[r * spec.auraSize, 48, 48]} />
          <meshBasicMaterial color={bodyColor} transparent opacity={0.1} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}
