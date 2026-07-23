// R3F Canvas 합성: 조명 / 별 / 환경맵 / 행성 / 친구 행성 / 파티클 / 카메라
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { ProceduralEnv } from "./ProceduralEnv";
import { GlassPlanet } from "./GlassPlanet";
import { FriendPlanet } from "./FriendPlanet";
import { FriendStreaks } from "./FriendStreaks";
import { EmotionParticles } from "./EmotionParticles";
import { CameraRig } from "./CameraRig";

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0.3, 7], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      dpr={[1, 2]}
    >
      <ProceduralEnv />
      <ambientLight color={0xb0a8e8} intensity={0.5} />
      <directionalLight color={0xffffff} intensity={1.6} position={[3, 4, 5]} />
      <directionalLight color={0xa394f7} intensity={1.0} position={[-4, -1, -3]} />
      <Stars radius={32} depth={14} count={520} factor={1.2} fade speed={0.3} />
      <CameraRig />
      <GlassPlanet />
      <FriendPlanet />
      <FriendStreaks />
      <EmotionParticles />
    </Canvas>
  );
}
