// world.js — builds the 3D drift arena: asphalt, markings, barriers, cones,
// buildings, lights and sky. Everything is built from primitives so there are
// no external model files to load (GitHub Pages friendly).

import * as THREE from 'three';

export const ARENA_HALF = 90; // half-size of the drivable asphalt (meters)

export function buildWorld(scene, quality = 'medium') {
  const group = new THREE.Group();
  scene.add(group);

  // ---- Sky (gradient via large back-side sphere) ----
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x2a4a7a) },
      bottom: { value: new THREE.Color(0x0b0e14) },
      horizon: { value: new THREE.Color(0xff9a5c) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = mix(horizon, top, clamp(h*1.6, 0.0, 1.0));
        col = mix(bottom, col, clamp((h+0.15)*3.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  scene.fog = new THREE.Fog(0x121826, 140, 480);

  // ---- Lighting ----
  const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x20242e, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0dd, 1.5);
  sun.position.set(60, 90, 30);
  sun.castShadow = quality !== 'low';
  if (sun.castShadow) {
    const s = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const d = 130;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);
  scene.add(sun.target);

  // ---- Ground beyond the arena (grass-ish) ----
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c2a1e, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = quality !== 'low';
  group.add(ground);

  // ---- Asphalt arena ----
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    roughness: 0.95,
    metalness: 0.0,
  });
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    asphaltMat
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0;
  asphalt.receiveShadow = quality !== 'low';
  group.add(asphalt);

  // ---- Painted markings ----
  addMarkings(group);

  // ---- Perimeter barriers ----
  addBarriers(group);

  // ---- Cones (a slalom line + scattered) ----
  addCones(group);

  // ---- Buildings around the arena ----
  addBuildings(group);

  // ---- Light poles ----
  addLightPoles(group, scene);

  return { group, sun };
}

function addMarkings(group) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.8 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xffcf3f, roughness: 0.8 });

  // Big central circle (drift donut guide).
  const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 12.2, 64), yellowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.011;
  group.add(ring);

  const ringInner = new THREE.Mesh(new THREE.RingGeometry(6.0, 6.4, 48), lineMat);
  ringInner.rotation.x = -Math.PI / 2;
  ringInner.position.y = 0.011;
  group.add(ringInner);

  // Dashed cross lanes.
  const dashGeo = new THREE.PlaneGeometry(3.4, 0.5);
  for (let i = -70; i <= 70; i += 8) {
    if (Math.abs(i) < 14) continue;
    const dh = new THREE.Mesh(dashGeo, lineMat);
    dh.rotation.x = -Math.PI / 2;
    dh.position.set(i, 0.01, 0);
    group.add(dh);

    const dv = new THREE.Mesh(dashGeo, lineMat);
    dv.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    dv.position.set(0, 0.01, i);
    group.add(dv);
  }

  // Corner apex chevrons.
  const chevMat = new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.8 });
  [[-60, -60], [60, -60], [-60, 60], [60, 60]].forEach(([x, z]) => {
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), chevMat);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = Math.PI / 4 * Math.sign(x) * Math.sign(z || 1);
      c.position.set(x + k * 1.4 * Math.sign(-x), 0.012, z);
      group.add(c);
    }
  });
}

function addBarriers(group) {
  const H = ARENA_HALF;
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
  const seg = 6; // barrier block length
  const height = 1.0;
  const thick = 0.6;

  const makeSide = (horizontal) => {
    const len = H * 2;
    const count = Math.floor(len / seg);
    for (let i = 0; i < count; i++) {
      const mat = i % 2 === 0 ? barrierMat : stripeMat;
      const box = new THREE.Mesh(new THREE.BoxGeometry(seg - 0.1, height, thick), mat);
      box.castShadow = true;
      box.receiveShadow = true;
      const pos = -H + seg / 2 + i * seg;
      if (horizontal) {
        box.position.set(pos, height / 2, -H);
        const box2 = box.clone();
        box2.position.set(pos, height / 2, H);
        group.add(box2);
      } else {
        box.geometry = new THREE.BoxGeometry(thick, height, seg - 0.1);
        box.position.set(-H, height / 2, pos);
        const box2 = box.clone();
        box2.position.set(H, height / 2, pos);
        group.add(box2);
      }
      group.add(box);
    }
  };
  makeSide(true);
  makeSide(false);
}

function addCones(group) {
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 12);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 });
  const baseGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);

  const place = (x, z) => {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 0.55, z);
    cone.castShadow = true;
    const base = new THREE.Mesh(baseGeo, coneMat);
    base.position.set(x, 0.06, z);
    group.add(cone, base);
  };

  // Slalom line.
  for (let z = -40; z <= 40; z += 8) place(28, z);
  // Scatter a few around.
  const scatter = [[-30, 20], [-34, 24], [-26, 28], [40, -30], [46, -26], [-50, -10], [50, 40], [-20, -45]];
  scatter.forEach(([x, z]) => place(x, z));
}

function addBuildings(group) {
  const palette = [0x3a4a63, 0x2c3a52, 0x45526b, 0x323f57];
  const H = ARENA_HALF + 18;
  const positions = [];
  // Ring of buildings outside the barriers.
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    const r = H + Math.random() * 40;
    positions.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  positions.forEach(([x, z]) => {
    const w = 10 + Math.random() * 16;
    const d = 10 + Math.random() * 16;
    const h = 12 + Math.random() * 46;
    const mat = new THREE.MeshStandardMaterial({
      color: palette[(Math.random() * palette.length) | 0],
      roughness: 0.85,
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);

    // Emissive "windows" strip.
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e16,
      emissive: 0xffcf7a,
      emissiveIntensity: 0.35,
      roughness: 1,
    });
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.8, d * 0.9), winMat);
    win.position.copy(b.position);
    group.add(win);
    // Draw the solid shell slightly larger so windows peek through gaps.
    b.scale.set(1.02, 1.0, 1.02);
  });
}

function addLightPoles(group, scene) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.5, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x222831,
    emissive: 0xfff2cc,
    emissiveIntensity: 0.8,
  });
  const corners = [[-70, -70], [70, -70], [-70, 70], [70, 70]];
  corners.forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 12, 8), poleMat);
    pole.position.set(x, 6, z);
    pole.castShadow = true;
    group.add(pole);

    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), headMat);
    head.position.set(x - Math.sign(x) * 1, 11.7, z);
    group.add(head);

    const pt = new THREE.PointLight(0xfff2cc, 0.9, 90, 2);
    pt.position.set(x - Math.sign(x) * 1, 11, z);
    scene.add(pt);
  });
}
