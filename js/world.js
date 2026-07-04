// world.js — "Forest" drift track. A bright, cartoony, low-poly beginner drift
// course: a wide curvy asphalt road through a grassy forest clearing, with
// trees, wooden guardrails, cones, signs, background hills and a sunny sky.
// Everything is primitives (no model/texture files) and kept light for mobile.

import * as THREE from 'three';

export const ARENA_HALF = 140; // half-size of the play area (meters)
export const TRACK_NAME = 'Forest';
export const ROAD_WIDTH = 36;  // very wide road → lots of room to slide & 360

export function buildWorld(scene, quality = 'medium') {
  const group = new THREE.Group();
  scene.add(group);

  // ---- Bright cartoony sky ----
  const skyGeo = new THREE.SphereGeometry(600, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x4aa6ff) },
      bottom: { value: new THREE.Color(0xcdefff) },
      horizon: { value: new THREE.Color(0xdff3ff) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon;
      void main(){
        float h = normalize(vPos).y;
        vec3 col = mix(horizon, top, clamp(h*1.4, 0.0, 1.0));
        col = mix(bottom, col, clamp((h+0.05)*4.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // Fluffy cartoon clouds (a few flattened sprites/spheres).
  addClouds(group);

  scene.fog = new THREE.Fog(0xcfeeff, 190, 540);

  // ---- Soft lighting ----
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x3a5a30, 0.95));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.35);
  sun.position.set(50, 85, 40);
  sun.castShadow = quality !== 'low';
  if (sun.castShadow) {
    const s = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const d = 120;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun, sun.target);

  // ---- Grass ground ----
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5bbf4a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = quality !== 'low';
  group.add(ground);

  // A slightly darker grass patch under the play area for definition.
  const infield = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_HALF + 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x66c94f, roughness: 1 })
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = -0.01;
  infield.receiveShadow = quality !== 'low';
  group.add(infield);

  // ---- The drift course: wide start straight, sweepers, an S and a hairpin ----
  const roadCurve = new THREE.CatmullRomCurve3(
    [
      [-12, 102],  // top straight (wide start area)
      [52, 98],
      [100, 70],   // long right sweeper
      [106, 26],
      [70, 4],     // S entry (tucks in)
      [106, -32],  // S exit
      [90, -78],   // bottom-right sweeper
      [34, -104],  // bottom straight
      [-28, -100],
      [-80, -88],
      [-114, -50], // bottom-left sweeper
      [-92, -18],  // hairpin approach
      [-116, 10],  // hairpin apex (sharp)
      [-74, 30],   // hairpin exit (doubles back)
      [-96, 64],   // left sweeper
      [-50, 96],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.5
  );
  const roadSamples = roadCurve.getPoints(360);
  buildRoad(group, roadSamples, quality);

  // ---- Wooden guardrails around the play area ----
  addWoodenRails(group);

  // ---- Trees (kept off the road) ----
  addTrees(group, roadSamples, quality);

  // ---- Cones + signs ----
  addConesAndSigns(group, roadSamples);

  // ---- Baked skid streaks on a few corners ----
  addStaticSkids(group, roadSamples);

  // ---- Background hills ----
  addHills(group);

  // Start point: on the road, facing along the direction of travel.
  const s0 = roadSamples[0];
  const s1 = roadSamples[3];
  const start = { x: s0.x, z: s0.z, yaw: Math.atan2(s1.x - s0.x, s1.z - s0.z) };

  return { group, sun, roadSamples, start };
}

// Build a flat ribbon of asphalt following the curve, plus white edge lines
// and a dashed centre line.
function buildRoad(group, samples, quality) {
  const width = ROAD_WIDTH;
  const half = width / 2;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x41474f, roughness: 0.95 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf3f6fa, roughness: 0.8 });

  const positions = [];
  const edgeL = [];
  const edgeR = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const next = samples[(i + 1) % samples.length];
    tan.subVectors(next, p).normalize();
    const nrm = new THREE.Vector3().crossVectors(up, tan).normalize(); // perpendicular in XZ
    const lx = p.x + nrm.x * half, lz = p.z + nrm.z * half;
    const rx = p.x - nrm.x * half, rz = p.z - nrm.z * half;
    positions.push({ lx, lz, rx, rz });
    edgeL.push(new THREE.Vector3(p.x + nrm.x * (half - 0.3), 0, p.z + nrm.z * (half - 0.3)));
    edgeR.push(new THREE.Vector3(p.x - nrm.x * (half - 0.3), 0, p.z - nrm.z * (half - 0.3)));
  }

  // Road surface triangles.
  const verts = [];
  const y = 0.02;
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % positions.length];
    verts.push(a.lx, y, a.lz, a.rx, y, a.rz, b.lx, y, b.lz);
    verts.push(b.lx, y, b.lz, a.rx, y, a.rz, b.rx, y, b.rz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, asphalt);
  road.receiveShadow = quality !== 'low';
  group.add(road);

  // White edge lines (thin ribbons).
  group.add(makeThinRibbon(edgeL, 0.35, 0.03, edgeMat));
  group.add(makeThinRibbon(edgeR, 0.35, 0.03, edgeMat));

  // Dashed yellow centre line.
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.8 });
  const dashGeo = new THREE.PlaneGeometry(0.5, 2.2);
  for (let i = 0; i < samples.length; i += 6) {
    const p = samples[i];
    const next = samples[(i + 1) % samples.length];
    const ang = Math.atan2(next.x - p.x, next.z - p.z);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.rotation.set(-Math.PI / 2, 0, -ang);
    dash.position.set(p.x, 0.035, p.z);
    group.add(dash);
  }
}

function makeThinRibbon(points, w, y, mat) {
  const half = w / 2;
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const verts = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[(i + 1) % points.length];
    tan.subVectors(next, p).normalize();
    const nrm = new THREE.Vector3().crossVectors(up, tan).normalize();
    const a = { lx: p.x + nrm.x * half, lz: p.z + nrm.z * half, rx: p.x - nrm.x * half, rz: p.z - nrm.z * half };
    const p2 = next;
    const b = { lx: p2.x + nrm.x * half, lz: p2.z + nrm.z * half, rx: p2.x - nrm.x * half, rz: p2.z - nrm.z * half };
    verts.push(a.lx, y, a.lz, a.rx, y, a.rz, b.lx, y, b.lz);
    verts.push(b.lx, y, b.lz, a.rx, y, a.rz, b.rx, y, b.rz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function addClouds(group) {
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  const puff = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const n = 3 + (Math.random() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(puff, cloudMat);
      m.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8);
      m.scale.setScalar(4 + Math.random() * 5);
      cloud.add(m);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 220 + Math.random() * 180;
    cloud.position.set(Math.cos(a) * r, 90 + Math.random() * 70, Math.sin(a) * r);
    group.add(cloud);
  }
}

function addWoodenRails(group) {
  const H = ARENA_HALF;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.85 });
  const seg = 8;
  const postGeo = new THREE.BoxGeometry(0.4, 1.3, 0.4);
  const railGeoH = new THREE.BoxGeometry(seg, 0.28, 0.25);
  const railGeoV = new THREE.BoxGeometry(0.25, 0.28, seg);

  const place = (horizontal) => {
    const count = Math.floor((H * 2) / seg);
    for (let i = 0; i <= count; i++) {
      const pos = -H + i * seg;
      // posts
      [[-H], [H]].forEach(([edge]) => {
        const post = new THREE.Mesh(postGeo, postMat);
        if (horizontal) post.position.set(pos, 0.65, edge);
        else post.position.set(edge, 0.65, pos);
        post.castShadow = true;
        group.add(post);
      });
      // rails between posts
      if (i < count) {
        const c = pos + seg / 2;
        [[-H], [H]].forEach(([edge]) => {
          const rail = new THREE.Mesh(horizontal ? railGeoH : railGeoV, railMat);
          if (horizontal) rail.position.set(c, 0.95, edge);
          else rail.position.set(edge, 0.95, c);
          rail.castShadow = true;
          group.add(rail);
        });
      }
    }
  };
  place(true);
  place(false);
}

function addTrees(group, roadSamples, quality) {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
  const foliageGeos = [
    new THREE.ConeGeometry(2.4, 4.5, 7),
    new THREE.ConeGeometry(2.0, 3.6, 7),
    new THREE.SphereGeometry(2.2, 7, 6),
  ];
  const foliageMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x3aa84a, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x277d33, roughness: 0.95, flatShading: true }),
  ];

  const roadClear = ROAD_WIDTH / 2 + 8; // keep trees clear of the wider road
  const tooCloseToRoad = (x, z) => {
    for (let i = 0; i < roadSamples.length; i += 3) {
      const p = roadSamples[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < roadClear * roadClear) return true;
    }
    return false;
  };

  const target = quality === 'low' ? 54 : 96;
  let placed = 0, attempts = 0;
  while (placed < target && attempts < target * 12) {
    attempts++;
    // Ring: mostly near/outside the edges + a small central island.
    const inner = Math.random() < 0.26;
    const r = inner ? Math.random() * 30 : 82 + Math.random() * 92;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < ARENA_HALF - 3 && Math.abs(z) < ARENA_HALF - 3 && tooCloseToRoad(x, z)) continue;

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = quality !== 'low';
    tree.add(trunk);

    const idx = Math.random() * foliageGeos.length | 0;
    const f = new THREE.Mesh(foliageGeos[idx], foliageMats[idx]);
    f.position.y = 4.4;
    f.castShadow = quality !== 'low';
    tree.add(f);
    // stacked tufts for a fuller, rounder cartoon tree
    const f2 = new THREE.Mesh(foliageGeos[(idx + 1) % foliageGeos.length], foliageMats[(idx + 1) % foliageMats.length]);
    f2.position.y = 6.1;
    f2.scale.setScalar(0.72);
    f2.castShadow = quality !== 'low';
    tree.add(f2);
    const f3 = new THREE.Mesh(foliageGeos[2], foliageMats[idx]);
    f3.position.y = 7.4;
    f3.scale.setScalar(0.45);
    tree.add(f3);

    const s = 0.8 + Math.random() * 0.9;
    tree.scale.setScalar(s);
    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI;
    group.add(tree);
    placed++;
  }
}

// Outward edge point + tangent angle at a road sample.
function edgeAt(samples, i, extra) {
  const len = samples.length;
  const p = samples[i % len];
  const n = samples[(i + 1) % len];
  const tx = n.x - p.x, tz = n.z - p.z;
  const l = Math.hypot(tx, tz) || 1;
  let nx = tz / l, nz = -tx / l;            // road normal
  if (nx * p.x + nz * p.z < 0) { nx = -nx; nz = -nz; } // point outward
  const off = ROAD_WIDTH / 2 + extra;
  return { x: p.x + nx * off, z: p.z + nz * off, ang: Math.atan2(tx, tz), nx, nz };
}

function addConesAndSigns(group, roadSamples) {
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 10);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, flatShading: true });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const baseGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10);

  // Delineator cones lining the outer road edge.
  for (let i = 0; i < roadSamples.length; i += 26) {
    const e = edgeAt(roadSamples, i, 1.6);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(e.x, 0.55, e.z);
    cone.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 10), stripeMat);
    stripe.position.set(e.x, 0.62, e.z);
    const base = new THREE.Mesh(baseGeo, coneMat);
    base.position.set(e.x, 0.06, e.z);
    group.add(cone, stripe, base);
  }

  // Cartoony chevron "drift arrow" signs facing the road on some corners.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.6, metalness: 0.3 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x1c2330, roughness: 0.6 });
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, emissive: 0x5a4700, emissiveIntensity: 0.3 });
  const makeChevronSign = (i, flip) => {
    const e = edgeAt(roadSamples, i, 4.5);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3, 8), postMat);
    post.position.y = 1.5; post.castShadow = true; g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.16), boardMat);
    board.position.y = 3; board.castShadow = true; g.add(board);
    // two chevrons pointing along the turn
    for (let k = -1; k <= 1; k += 2) {
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.2), arrowMat);
      a1.position.set(k * 0.35, 3.2, 0.1); a1.rotation.z = flip * 0.6 * -k; g.add(a1);
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.2), arrowMat);
      a2.position.set(k * 0.35, 2.8, 0.1); a2.rotation.z = flip * 0.6 * -k; g.add(a2);
    }
    g.position.set(e.x, 0, e.z);
    g.rotation.y = e.ang + Math.PI / 2;
    group.add(g);
  };
  makeChevronSign(70, 1);
  makeChevronSign(180, -1);
  makeChevronSign(300, 1);
}

// Faint pre-existing skid streaks baked onto a couple of corners for flavor.
function addStaticSkids(group, roadSamples) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.4, depthWrite: false });
  const geo = new THREE.PlaneGeometry(0.5, 1.4);
  const mesh = new THREE.InstancedMesh(geo, mat, 120);
  mesh.renderOrder = 1;
  const d = new THREE.Object3D();
  let n = 0;
  const arcs = [[40, 90], [150, 200], [255, 300]];
  for (const [a, b] of arcs) {
    for (let i = a; i < b && n < 120; i += 2) {
      const p = roadSamples[i % roadSamples.length];
      const nx = roadSamples[(i + 1) % roadSamples.length];
      const ang = Math.atan2(nx.x - p.x, nx.z - p.z);
      const lateral = (Math.sin(i * 0.5) * ROAD_WIDTH * 0.28);
      const perpx = Math.cos(ang), perpz = -Math.sin(ang);
      d.position.set(p.x + perpx * lateral, 0.02, p.z + perpz * lateral);
      d.rotation.set(-Math.PI / 2, 0, -ang);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      mesh.setMatrixAt(n++, d.matrix);
    }
  }
  mesh.count = n;
  group.add(mesh);
}

function addHills(group) {
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4aa63e, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = 150 + Math.random() * 120;
    const s = 30 + Math.random() * 55;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), hillMat);
    hill.position.set(Math.cos(a) * r, -s * 0.55, Math.sin(a) * r);
    hill.scale.y = 0.5;
    group.add(hill);
  }
}
