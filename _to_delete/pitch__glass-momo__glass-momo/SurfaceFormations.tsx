// 행성 표면 형성물.
// 분기(branch)별로 다른 메시(만개=유리 나무+꽃, 평온=결정, 긴장=가시, 시듦=마른 가지, 공허=파편)
// 누적 감정량(amount)에 비례하여 개수가 늘어남.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BranchKey } from "./constants";

interface Spot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  target: number;
  seed: number;
  key: number;
}

const R = 1.56;

function buildSpots(branch: BranchKey, amount: number): Spot[] {
  const totalSpots = 28;
  const candidates: Array<[number, number]> = [];
  for (let i = 0; i < totalSpots; i++) {
    candidates.push([Math.random() * 1.4 - 0.7, Math.random() * Math.PI * 2]);
  }
  const baseN = Math.round(amount * 22);
  const n = branch === "void" ? Math.round(baseN * 0.4) : baseN;

  const up = new THREE.Vector3(0, 1, 0);
  const out: Spot[] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lon] = candidates[i % candidates.length];
    const pos = new THREE.Vector3(
      R * Math.cos(lat) * Math.cos(lon),
      R * Math.sin(lat),
      R * Math.cos(lat) * Math.sin(lon),
    );
    const dir = pos.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    out.push({
      pos,
      quat,
      target: 0.7 + Math.random() * 0.6,
      seed: Math.random(),
      key: i,
    });
  }
  return out;
}

interface FormationItemProps {
  branch: BranchKey;
  spot: Spot;
}

function FormationItem({ branch, spot }: FormationItemProps) {
  const grp = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!grp.current) return;
    const cur = grp.current.scale.x;
    if (cur < spot.target) {
      grp.current.scale.setScalar(Math.min(spot.target, cur + dt * 4));
    }
  });

  return (
    <group
      ref={grp}
      position={spot.pos.toArray()}
      quaternion={[spot.quat.x, spot.quat.y, spot.quat.z, spot.quat.w]}
      scale={0.001}
    >
      <BranchMesh branch={branch} seed={spot.seed} idx={spot.key} />
    </group>
  );
}

function BranchMesh({ branch, seed, idx }: { branch: BranchKey; seed: number; idx: number }) {
  if (branch === "bloom") {
    // 유리 나무: 줄기 + 잎(콘) + (3개에 1개) 분홍 꽃
    return (
      <>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.03, 0.05, 0.24, 6]} />
          <meshPhysicalMaterial
            color={"#9ed8b4"}
            roughness={0.2}
            transmission={0.7}
            thickness={0.6}
            ior={1.35}
            transparent
            envMapIntensity={1.1}
          />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <coneGeometry args={[0.16, 0.32, 7]} />
          <meshPhysicalMaterial
            color={"#7fe0a8"}
            roughness={0.1}
            transmission={0.6}
            thickness={0.6}
            ior={1.35}
            transparent
            emissive={"#3fa86a"}
            emissiveIntensity={0.15}
            envMapIntensity={1.1}
          />
        </mesh>
        {idx % 3 === 0 && (
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshPhysicalMaterial
              color={"#e87fb8"}
              roughness={0.15}
              transmission={0.5}
              thickness={0.5}
              ior={1.35}
              transparent
              emissive={"#e87fb8"}
              emissiveIntensity={0.3}
              envMapIntensity={1.1}
            />
          </mesh>
        )}
      </>
    );
  }
  if (branch === "calm") {
    // 평온: 잔잔한 옥타헤드론 결정
    return (
      <mesh position={[0, 0.08, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshPhysicalMaterial
          color={"#9ec8ff"}
          roughness={0.05}
          transmission={0.85}
          thickness={0.5}
          ior={1.4}
          transparent
          emissive={"#6f9ae8"}
          emissiveIntensity={0.2}
          envMapIntensity={1.2}
        />
      </mesh>
    );
  }
  if (branch === "tense") {
    // 긴장: 뾰족한 가시 콘
    return (
      <mesh position={[0, 0.17, 0]}>
        <coneGeometry args={[0.06, 0.34, 5]} />
        <meshPhysicalMaterial
          color={"#f0b46a"}
          roughness={0.05}
          transmission={0.6}
          thickness={0.6}
          ior={1.35}
          transparent
          emissive={"#d99a4e"}
          emissiveIntensity={0.3}
          envMapIntensity={1.2}
        />
      </mesh>
    );
  }
  if (branch === "wither") {
    // 시듦: 메마른 가지(살짝 기울어진 실린더)
    const tilt = (seed - 0.5) * 0.8;
    return (
      <mesh position={[0, 0.15, 0]} rotation={[0, 0, tilt]}>
        <cylinderGeometry args={[0.012, 0.03, 0.3, 5]} />
        <meshPhysicalMaterial
          color={"#8a6f6a"}
          roughness={0.4}
          transmission={0.4}
          thickness={0.4}
          ior={1.3}
          transparent
          envMapIntensity={0.9}
        />
      </mesh>
    );
  }
  // void: 떠다니는 파편
  const lift = 0.1 + seed * 0.15;
  return (
    <mesh position={[0, lift, 0]}>
      <tetrahedronGeometry args={[0.08, 0]} />
      <meshPhysicalMaterial
        color={"#b0aac4"}
        roughness={0.1}
        transmission={0.7}
        thickness={0.5}
        ior={1.3}
        transparent
        emissive={"#8a82a0"}
        emissiveIntensity={0.1}
        envMapIntensity={1.1}
      />
    </mesh>
  );
}

interface Props {
  branch: BranchKey;
  amount: number;
}

export function SurfaceFormations({ branch, amount }: Props) {
  // branch+amount 가 바뀔 때마다 새 spot 세트 생성 (분기 전환 = 표면 재구성)
  const spots = useMemo(() => buildSpots(branch, amount), [branch, amount]);
  return (
    <group>
      {spots.map((s) => (
        <FormationItem key={`${branch}-${s.key}`} branch={branch} spot={s} />
      ))}
    </group>
  );
}
