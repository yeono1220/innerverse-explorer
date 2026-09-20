// 개발 전용: 3D 모모를 투명 배경 정사각 캔버스에 렌더해 PNG 로 뽑는다.
// /dev/momo-render (DEV 빌드에서만 라우트 등록). 결과는 public/momo/momo.png 에 넣어
// 2D 모모 슬롯(AssetImage) 전체에 적용한다. 프로덕션 번들에는 포함되지 않는다.
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { MomoCharacter } from "@/diorama/MomoCharacter";
import type { GrowthStage } from "@/diorama/growth";

declare global {
  interface Window {
    __captureMomo?: () => string;
  }
}

function Capture() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    window.__captureMomo = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    return () => {
      delete window.__captureMomo;
    };
  }, [gl, scene, camera]);
  return null;
}

export default function MomoRender() {
  const params = new URLSearchParams(window.location.search);
  const stage = (Number(params.get("stage")) || 5) as GrowthStage;
  const soul = params.get("soul") ?? "#8b7ff0";
  const size = Number(params.get("size")) || 512;
  const cz = Number(params.get("cz")) || 0.95; // 카메라 거리 (후광까지 프레임에)
  return (
    <div style={{ background: "#222", padding: 20, minHeight: "100vh" }}>
      <div style={{ width: size, height: size, background: "transparent" }}>
        <Canvas
          camera={{ position: [0, 0.1, cz], fov: 30 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          dpr={1}
          style={{ background: "transparent", width: size, height: size }}
          resize={{ scroll: false, debounce: 0 }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ambientLight color={0xb8b0e8} intensity={0.55} />
          <directionalLight color={0xffffff} intensity={1.3} position={[2.5, 3.5, 4]} />
          <directionalLight color={0xa394f7} intensity={0.6} position={[-3, -1, -2]} />
          <group position={[0, -0.02, 0]}>
            <MomoCharacter stage={stage} soulColor={soul} />
          </group>
          <Capture />
        </Canvas>
      </div>
      <p style={{ color: "#aaa", fontSize: 12 }}>
        ?stage=1..7 &soul=%23hex &size=512 — 콘솔에서 window.__captureMomo() 로 PNG dataURL
      </p>
    </div>
  );
}
