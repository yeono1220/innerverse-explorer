// 절차적 PMREM 환경맵.
// MeshPhysicalMaterial transmission이 비추려면 envMap이 필수.
// 보라 그라데이션 돔 + 4개의 발광 구체로 유리에 비치는 하이라이트를 만든다.
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export function ProceduralEnv() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();

    // 그라데이션 돔
    const skyGeo = new THREE.SphereGeometry(50, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y * 0.5 + 0.5;
          vec3 top = vec3(0.11, 0.08, 0.19);
          vec3 mid = vec3(0.32, 0.25, 0.55);
          vec3 bot = vec3(0.05, 0.04, 0.08);
          vec3 c = mix(bot, mid, smoothstep(0.0, 0.5, h));
          c = mix(c, top, smoothstep(0.5, 1.0, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(sky);

    const cols = [0x8b7ff0, 0x5fc88a, 0xd99a4e, 0xe87fb8];
    const blobMats: THREE.MeshBasicMaterial[] = [];
    const blobGeos: THREE.SphereGeometry[] = [];
    cols.forEach((c, i) => {
      const geo = new THREE.SphereGeometry(3, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: c });
      const m = new THREE.Mesh(geo, mat);
      const a = (i / cols.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 16, Math.sin(a * 1.3) * 8, Math.sin(a) * 16);
      envScene.add(m);
      blobMats.push(mat);
      blobGeos.push(geo);
    });

    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;

    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;

    return () => {
      scene.environment = null;
      rt.texture.dispose();
      pmrem.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      blobGeos.forEach((g) => g.dispose());
      blobMats.forEach((m) => m.dispose());
    };
  }, [gl, scene]);

  return null;
}
