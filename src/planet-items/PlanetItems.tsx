// 구매한 인벤토리 아이템을 행성 표면에 얹는 3D 레이어.
// 홈(HomeAvatarStage)과 /glass(GlassPlanet)가 같은 컴포넌트를 쓰므로,
// 아이템은 두 화면에서 같은 자리에 나타난다.
import { useMemo, useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAppStore } from "@/store/appStore";
import { placementToVec3, type ItemPlacement } from "./placement";

/** 이모지를 캔버스에 그려 텍스처로 캐시 (아이템당 1회). */
const texCache = new Map<string, THREE.Texture>();

function emojiTexture(emoji: string): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const hit = texCache.get(emoji);
  if (hit) return hit;
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${Math.round(size * 0.76)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size * 0.54);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(emoji, tex);
  return tex;
}

interface ItemProps {
  placement: ItemPlacement;
  emoji: string;
  /** 행성 반지름 */
  radius: number;
  /** 아이템 한 변의 길이 (행성 반지름 대비 비율) */
  ratio: number;
}

function PlanetItem({ placement, emoji, radius, ratio }: ItemProps) {
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => emojiTexture(emoji), [emoji]);
  const size = radius * ratio * (0.85 + placement.seed * 0.3);

  // 표면에서 살짝 띄워 아이템 밑동이 행성에 닿아 보이게 한다.
  const base = useMemo(
    () => placementToVec3(placement, radius),
    [placement, radius],
  );
  const pos = useMemo(
    () => base.clone().multiplyScalar(1 + (size * 0.42) / radius),
    [base, radius, size],
  );

  // 아주 느린 상하 부유 — 유리 우주의 정적인 느낌을 깨지 않을 정도로만.
  useFrame((state) => {
    if (!grp.current) return;
    const t = state.clock.elapsedTime * 0.8 + placement.seed * Math.PI * 2;
    grp.current.position.copy(base).multiplyScalar(
      1 + (size * 0.42 + Math.sin(t) * size * 0.05) / radius,
    );
  });

  if (!tex) return null;

  return (
    <group ref={grp} position={pos.toArray()}>
      <Billboard>
        <mesh>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial
            map={tex}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* 아이템 뒤편의 은은한 후광 — 유리 행성 위에서도 형태가 읽히도록 */}
        <mesh position={[0, 0, -0.001]}>
          <circleGeometry args={[size * 0.42, 20]} />
          <meshBasicMaterial
            color={"#ffffff"}
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

interface Props {
  /** 아이템을 얹을 행성 반지름 */
  radius: number;
  /** 아이템 크기 비율 (기본 0.3 = 반지름의 30%) */
  ratio?: number;
}

export function PlanetItems({ radius, ratio = 0.3 }: Props) {
  const placements = useAppStore((s) => s.placements);
  const inventory = useAppStore((s) => s.inventory);

  const items = useMemo(() => {
    return placements
      .map((p) => {
        const item = inventory.find((i) => i.id === p.itemId);
        return item && item.owned ? { p, emoji: item.emoji } : null;
      })
      .filter((x): x is { p: ItemPlacement; emoji: string } => x !== null);
  }, [placements, inventory]);

  return (
    <group>
      {items.map(({ p, emoji }) => (
        <PlanetItem
          key={p.itemId}
          placement={p}
          emoji={emoji}
          radius={radius}
          ratio={ratio}
        />
      ))}
    </group>
  );
}
