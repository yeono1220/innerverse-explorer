// 일기 한 개당 행성 위에 구조물 한 개. 감정에 따라 종류가 다름.
// 위치는 일기 id 해시 기반 deterministic — 같은 일기는 항상 같은 자리.
import { useMemo } from "react";
import * as THREE from "three";
import { useDiaryStore } from "@/store/diaryStore";
import { placeStructures, type PlacedStructure } from "./utils";
import { PLANET_RADIUS } from "./constants";

export function Structures() {
  const entries = useDiaryStore((s) => s.entries);
  const placed = useMemo(() => placeStructures(entries), [entries]);
  return (
    <group>
      {placed.map((p) => (
        <StructureSlot key={p.id} p={p} />
      ))}
    </group>
  );
}

function StructureSlot({ p }: { p: PlacedStructure }) {
  // 표면 좌표 + 표면 노멀에 맞춰 회전 (구조물이 행성 밖으로 자라남)
  const { pos, quat } = useMemo(() => {
    const v = new THREE.Vector3(
      PLANET_RADIUS * Math.cos(p.lat) * Math.cos(p.lon),
      PLANET_RADIUS * Math.sin(p.lat),
      PLANET_RADIUS * Math.cos(p.lat) * Math.sin(p.lon),
    );
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    return { pos: v, quat: q };
  }, [p.lat, p.lon]);

  return (
    <group position={pos.toArray()} quaternion={[quat.x, quat.y, quat.z, quat.w]}>
      {p.type === "flowerTree" && <FlowerTree seed={p.seed} />}
      {p.type === "stoneStack" && <StoneStack seed={p.seed} />}
      {p.type === "heartBloom" && <HeartBloom seed={p.seed} />}
      {p.type === "clockTower" && <ClockTower seed={p.seed} />}
      {p.type === "gravestone" && <Gravestone seed={p.seed} />}
      {p.type === "emberSpike" && <EmberSpike seed={p.seed} />}
      {p.type === "emptyCage" && <EmptyCage seed={p.seed} />}
    </group>
  );
}

function FlowerTree({ seed }: { seed: number }) {
  const flowerColor = seed > 0.5 ? "#e87fb8" : "#e8c45f";
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.18, 6]} />
        <meshStandardMaterial color={"#6e4a2e"} flatShading />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <coneGeometry args={[0.11, 0.2, 7]} />
        <meshStandardMaterial color={"#5fc88a"} flatShading />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color={flowerColor} emissive={flowerColor} emissiveIntensity={0.35} flatShading />
      </mesh>
    </group>
  );
}

function StoneStack({ seed }: { seed: number }) {
  const offset = (seed - 0.5) * 0.02;
  return (
    <group>
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[0.18, 0.08, 0.14]} />
        <meshStandardMaterial color={"#7a8088"} flatShading />
      </mesh>
      <mesh position={[offset, 0.13, offset]} castShadow>
        <boxGeometry args={[0.13, 0.07, 0.11]} />
        <meshStandardMaterial color={"#8a909a"} flatShading />
      </mesh>
      <mesh position={[-offset, 0.21, -offset]} castShadow>
        <boxGeometry args={[0.09, 0.06, 0.08]} />
        <meshStandardMaterial color={"#9aa0aa"} flatShading />
      </mesh>
    </group>
  );
}

function ClockTower({ seed }: { seed: number }) {
  const tint = seed > 0.5 ? "#d99a4e" : "#c97a3e";
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color={tint} flatShading />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <coneGeometry args={[0.085, 0.12, 4]} />
        <meshStandardMaterial color={"#8a4e20"} flatShading />
      </mesh>
      {/* 시계 면 */}
      <mesh position={[0, 0.34, 0.051]}>
        <circleGeometry args={[0.025, 12]} />
        <meshStandardMaterial color={"#ffffff"} emissive={"#fff7d0"} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function Gravestone({ seed: _seed }: { seed: number }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.14, 0.16, 0.04]} />
        <meshStandardMaterial color={"#6a6480"} flatShading />
      </mesh>
      {/* 둥근 윗부분 */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 12, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={"#6a6480"} flatShading />
      </mesh>
    </group>
  );
}

function HeartBloom({ seed }: { seed: number }) {
  // 사랑 — 분홍 하트꽃잎 꽃송이 (줄기 + 두 구 + 아래 콘으로 하트 실루엣)
  const tint = seed > 0.5 ? "#e87fb8" : "#f2a0c8";
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.03, 0.16, 6]} />
        <meshStandardMaterial color={"#7a9e6e"} flatShading />
      </mesh>
      <mesh position={[-0.045, 0.28, 0]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} flatShading />
      </mesh>
      <mesh position={[0.045, 0.28, 0]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.085, 0.14, 8]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.35} flatShading />
      </mesh>
    </group>
  );
}

function EmberSpike({ seed }: { seed: number }) {
  // 분노 — 크게 터지는 붉은 폭죽 (잔불 바닥 + 콘 3개)
  const tint = seed > 0.5 ? "#e8744e" : "#f0562e";
  const spikes: Array<[number, number, number, number]> = [
    [0, 0.22, 0, 0.34],
    [0.06, 0.16, 0.03, 0.22],
    [-0.05, 0.15, -0.04, 0.2],
  ];
  return (
    <group>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.04, 8]} />
        <meshStandardMaterial color={"#7a2e1e"} flatShading />
      </mesh>
      {spikes.map(([x, y, z, h], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <coneGeometry args={[0.045, h, 5]} />
          <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.5} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function EmptyCage({ seed: _seed }: { seed: number }) {
  return (
    <group>
      {/* 바닥 */}
      <mesh position={[0, 0.01, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.015, 12]} />
        <meshStandardMaterial color={"#5a5468"} flatShading />
      </mesh>
      {/* 세로 봉 4개 */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.07, 0.11, Math.sin(a) * 0.07]} castShadow>
            <cylinderGeometry args={[0.006, 0.006, 0.2, 4]} />
            <meshStandardMaterial color={"#8a82a0"} />
          </mesh>
        );
      })}
      {/* 뚜껑 */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <coneGeometry args={[0.06, 0.05, 8]} />
        <meshStandardMaterial color={"#5a5468"} flatShading />
      </mesh>
      {/* 손잡이 (선) */}
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color={"#8a82a0"} />
      </mesh>
    </group>
  );
}
