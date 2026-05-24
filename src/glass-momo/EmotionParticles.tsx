// 감정 버튼 클릭 시 모모 위치에서 색 입자 burst.
// AdditiveBlending Points. 중력으로 천천히 낙하하며 페이드 → dispose.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEmotionStore, COL } from "@/store/emotionStore";
import { sharedRefs } from "./sharedRefs";

interface Burst {
  pts: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  vel: THREE.Vector3[];
  life: number;
}

const PARTICLE_COUNT = 70;

export function EmotionParticles() {
  const { scene } = useThree();
  const burstTick = useEmotionStore((s) => s.burstTick);
  const lastBurstEmo = useEmotionStore((s) => s.lastBurstEmo);
  const lastBurstOrigin = useEmotionStore((s) => s.lastBurstOrigin);

  const seen = useRef(burstTick);
  const bursts = useRef<Burst[]>([]);

  useEffect(() => {
    if (burstTick === seen.current || !lastBurstEmo) return;
    seen.current = burstTick;

    const origin =
      lastBurstOrigin === "friend" ? sharedRefs.friendMomoWorldPos : sharedRefs.momoWorldPos;
    spawnBurst(origin.clone(), COL[lastBurstEmo]);
  }, [burstTick, lastBurstEmo, lastBurstOrigin]);

  useEffect(() => {
    const list = bursts.current;
    const sc = scene;
    return () => {
      list.forEach((b) => {
        sc.remove(b.pts);
        b.geo.dispose();
        b.mat.dispose();
      });
    };
  }, [scene]);

  function spawnBurst(origin: THREE.Vector3, colors: [number, number]) {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const vel: THREE.Vector3[] = [];
    const colorObjs = colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = origin.x;
      pos[i * 3 + 1] = origin.y;
      pos[i * 3 + 2] = origin.z;
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 0.2, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar(0.02 + Math.random() * 0.05);
      vel.push(v);
      const c = colorObjs[i % colorObjs.length];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    bursts.current.push({ pts, geo, mat, vel, life: 1 });
  }

  useFrame((_, dt) => {
    for (let i = bursts.current.length - 1; i >= 0; i--) {
      const b = bursts.current[i];
      const arr = b.geo.attributes.position.array as Float32Array;
      for (let j = 0; j < b.vel.length; j++) {
        arr[j * 3] += b.vel[j].x;
        arr[j * 3 + 1] += b.vel[j].y;
        arr[j * 3 + 2] += b.vel[j].z;
        b.vel[j].y -= 0.0008; // 약한 중력
      }
      b.geo.attributes.position.needsUpdate = true;
      b.life -= dt * 0.6;
      b.mat.opacity = Math.max(0, b.life);
      if (b.life <= 0) {
        scene.remove(b.pts);
        b.geo.dispose();
        b.mat.dispose();
        bursts.current.splice(i, 1);
      }
    }
  });

  return null;
}
