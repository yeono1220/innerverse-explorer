// 친구 모드 시 두 모모 사이로 0.5초 간격 감정 교류 라인.
// 시작점에서 끝점으로 라인이 뻗어나가다 페이드 → dispose.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore, BRANCH } from "@/store/emotionStore";
import { sharedRefs } from "./sharedRefs";

const PINK = 0xe87fb8;

interface Streak {
  a: THREE.Vector3;
  b: THREE.Vector3;
  line: THREE.Line;
  geo: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
  t: number;
}

export function FriendStreaks() {
  const { scene } = useThree();
  const friendMode = useEmotionStore((s) => s.friendMode);
  const branch = useEmotionStore((s) => s.branch);

  const streaks = useRef<Streak[]>([]);
  const cooldown = useRef(0);

  // friendMode 꺼지면 즉시 정리
  useEffect(() => {
    if (!friendMode) {
      streaks.current.forEach((s) => {
        scene.remove(s.line);
        s.geo.dispose();
        s.mat.dispose();
      });
      streaks.current = [];
      cooldown.current = 0;
    }
  }, [friendMode, scene]);

  // 언마운트 시 안전 정리
  useEffect(() => {
    const list = streaks.current;
    const sc = scene;
    return () => {
      list.forEach((s) => {
        sc.remove(s.line);
        s.geo.dispose();
        s.mat.dispose();
      });
    };
  }, [scene]);

  useFrame((_, dt) => {
    if (friendMode) {
      cooldown.current -= dt;
      if (cooldown.current <= 0) {
        cooldown.current = 0.5;
        const a = sharedRefs.momoWorldPos.clone();
        const b = sharedRefs.friendMomoWorldPos.clone();
        spawnStreak(a, b, BRANCH[branch].tint);
        spawnStreak(b.clone(), a.clone(), PINK);
      }
    }

    // 진행/정리
    for (let i = streaks.current.length - 1; i >= 0; i--) {
      const s = streaks.current[i];
      s.t += dt * 1.6;
      const head = s.a.clone().lerp(s.b, Math.min(1, s.t));
      const tail = s.a.clone().lerp(s.b, Math.max(0, s.t - 0.25));
      s.geo.setFromPoints([tail, head]);
      s.mat.opacity = 0.85 * (1 - Math.max(0, s.t - 0.7) / 0.3);
      if (s.t > 1) {
        scene.remove(s.line);
        s.geo.dispose();
        s.mat.dispose();
        streaks.current.splice(i, 1);
      }
    }
  });

  function spawnStreak(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    streaks.current.push({ a, b, line, geo, mat, t: 0 });
  }

  return null;
}
