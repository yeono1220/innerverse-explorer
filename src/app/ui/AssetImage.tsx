// 디자인 에셋 슬롯. public/ 에 이미지가 있으면 그걸 쓰고, 없거나 로드 실패하면
// children(기존 이모지·CSS 렌더)을 그대로 보여준다.
// → 디자이너가 파일만 넣으면 코드 수정 없이 교체되고, 없어도 화면이 비지 않는다.
//
//   모모:   public/momo/momo.png          (채팅 아바타 등 2D)
//   아이템: public/items/<item id>.png    (예: public/items/i1.png = 달 데코)
import { useState, type CSSProperties, type ReactNode } from "react";

// 한 번 실패한 경로는 세션 내내 다시 시도하지 않는다(404 반복 방지).
const missing = new Set<string>();

export function AssetImage({
  src,
  size,
  alt = "",
  style,
  children,
}: {
  src: string;
  size: number;
  alt?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [failed, setFailed] = useState(() => missing.has(src));
  if (failed) return <>{children}</>;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      onError={() => {
        missing.add(src);
        setFailed(true);
      }}
      style={{ display: "block", objectFit: "contain", ...style }}
    />
  );
}

/** 인벤토리 아이템 이미지 경로 규칙 (3D 텍스처 로더와 공유). */
export const itemImageSrc = (id: string) => `/items/${id}.png`;
export const MOMO_IMAGE_SRC = "/momo/momo.png";
