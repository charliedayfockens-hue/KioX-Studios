// world.js — the "Pine Ridge Circuit" drift track, built to match the supplied
// layout blueprint: long front straight, long right exit, medium right, the
// long sweepers right→left across the top, an S-curve on the left, a tight
// hairpin bottom-left and a medium left back onto the straight. Forest theme
// with dense pines, rocks, guardrails, tire barriers, curbs and drift signs.
// All primitives (no model/texture files), light for mobile. The road samples
// double as the AI's waypoint path.

import * as THREE from 'three';

export const ARENA_HALF = 150; // half-size of the play area (meters)
export const ROAD_WIDTH = 38;  // wide, consistent road → room to slide, 360 & reverse-drift
export const TRACK_NAME = 'Pine Ridge Circuit';

// Pine Ridge Circuit centreline (traced from the layout blueprint), z up:
//   front straight (bottom) → long right exit → medium-right chicane up the
//   right → long sweeper right (top-right) → dip → long sweeper left (top-left)
//   → down the left → S-curve → tight hairpin (bottom-left) → medium left →
//   back onto the front straight.
const PINE_RIDGE_POINTS = [
  [-33, -83],  // 1 start / finish (front straight)
  [58, -86],   //   front straight
  [105, -68],  // 8 long right exit
  [121, -26],  //   right side
  [100, 14],   // 2 medium right
  [116, 56],   //   corner out
  [72, 83],    // 3 long sweeper right (top-right)
  [19, 88],    //   top
  [-28, 62],   //   dip between sweepers
  [-74, 83],   // 4 long sweeper left (top-left)
  [-106, 52],  //   down the left
  [-95, 19],   // 5 S-curve (out)
  [-70, 2],    //   S-curve (in)
  [-91, -28],  //   S-curve (out) → hairpin approach
  [-120, -55], // 6 hairpin left (apex)
  [-83, -72],  //   hairpin exit
  [-31, -43],  // 7 medium left → onto the front straight
];

const THEME = {
  sky: { top: 0x4aa6ff, bottom: 0xcdefff, horizon: 0xdff3ff },
  fog: 0xcfeeff, fogNear: 200, fogFar: 560,
  hemiSky: 0xdff1ff, hemiGround: 0x3a5a30, hemiInt: 0.95,
  sunColor: 0xfff6e0, sunInt: 1.35,
  ground: 0x5bbf4a, infield: 0x66c94f,
  road: 0x41474f, edge: 0xf3f6fa, dash: 0xffd23f,
  hill: 0x4aa63e, cloud: 0xffffff,
};

export function buildWorld(scene, quality = 'medium') {
  const t = THEME;
  const group = new THREE.Group();
  scene.add(group);

  // ---- Sky ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(t.sky.top) },
      bottom: { value: new THREE.Color(t.sky.bottom) },
      horizon: { value: new THREE.Color(t.sky.horizon) },
    },
    vertexShader: `varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon;
      void main(){ float h = normalize(vPos).y;
        vec3 col = mix(horizon, top, clamp(h*1.4,0.0,1.0));
        col = mix(bottom, col, clamp((h+0.05)*4.0,0.0,1.0));
        gl_FragColor = vec4(col,1.0); }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), skyMat));
  addClouds(group, t.cloud);
  scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);

  // ---- Lighting ----
  scene.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiInt));
  const sun = new THREE.DirectionalLight(t.sunColor, t.sunInt);
  sun.position.set(50, 85, 40);
  sun.castShadow = quality !== 'low';
  if (sun.castShadow) {
    const s = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const d = 130;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun, sun.target);

  // ---- Ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: t.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = quality !== 'low';
  group.add(ground);

  const infield = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_HALF + 6, 40),
    new THREE.MeshStandardMaterial({ color: t.infield, roughness: 1 })
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = -0.01;
  infield.receiveShadow = quality !== 'low';
  group.add(infield);

  // ---- Road (its samples are the AI waypoint path) ----
  const roadCurve = new THREE.CatmullRomCurve3(
    PINE_RIDGE_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5
  );
  const roadSamples = roadCurve.getPoints(360);
  buildRoad(group, roadSamples, quality, t);

  addWoodenRails(group);
  addCurbs(group, roadSamples);
  addTrees(group, roadSamples, quality);
  addRocks(group, roadSamples, quality);
  addConesAndSigns(group, roadSamples);
  addTireBarriers(group, roadSamples);
  addStaticSkids(group, roadSamples);
  addHills(group, t.hill);
  addStartLine(group, roadSamples);

  const s0 = roadSamples[0], s1 = roadSamples[3];
  const start = { x: s0.x, z: s0.z, yaw: Math.atan2(s1.x - s0.x, s1.z - s0.z) };

  return { group, sun, roadSamples, start, update: () => {}, trackLength: roadSamples.length };
}

// ---------- Road builder ----------
function buildRoad(group, samples, quality, theme) {
  const half = ROAD_WIDTH / 2;
  const asphalt = new THREE.MeshStandardMaterial({ color: theme.road, roughness: 0.95 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 0.8 });
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const positions = [], edgeL = [], edgeR = [];

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const next = samples[(i + 1) % samples.length];
    tan.subVectors(next, p).normalize();
    const nrm = new THREE.Vector3().crossVectors(up, tan).normalize();
    positions.push({
      lx: p.x + nrm.x * half, lz: p.z + nrm.z * half,
      rx: p.x - nrm.x * half, rz: p.z - nrm.z * half,
    });
    edgeL.push(new THREE.Vector3(p.x + nrm.x * (half - 0.3), 0, p.z + nrm.z * (half - 0.3)));
    edgeR.push(new THREE.Vector3(p.x - nrm.x * (half - 0.3), 0, p.z - nrm.z * (half - 0.3)));
  }

  const verts = [];
  const y = 0.02;
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i], b = positions[(i + 1) % positions.length];
    verts.push(a.lx, y, a.lz, a.rx, y, a.rz, b.lx, y, b.lz);
    verts.push(b.lx, y, b.lz, a.rx, y, a.rz, b.rx, y, b.rz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, asphalt);
  road.receiveShadow = quality !== 'low';
  group.add(road);

  group.add(makeThinRibbon(edgeL, 0.35, 0.03, edgeMat));
  group.add(makeThinRibbon(edgeR, 0.35, 0.03, edgeMat));

  const dashMat = new THREE.MeshStandardMaterial({ color: theme.dash, roughness: 0.8 });
  const dashGeo = new THREE.PlaneGeometry(0.5, 2.4);
  for (let i = 0; i < samples.length; i += 6) {
    const p = samples[i], next = samples[(i + 1) % samples.length];
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
    const p = points[i], next = points[(i + 1) % points.length];
    tan.subVectors(next, p).normalize();
    const nrm = new THREE.Vector3().crossVectors(up, tan).normalize();
    const a = { lx: p.x + nrm.x * half, lz: p.z + nrm.z * half, rx: p.x - nrm.x * half, rz: p.z - nrm.z * half };
    const b = { lx: next.x + nrm.x * half, lz: next.z + nrm.z * half, rx: next.x - nrm.x * half, rz: next.z - nrm.z * half };
    verts.push(a.lx, y, a.lz, a.rx, y, a.rz, b.lx, y, b.lz);
    verts.push(b.lx, y, b.lz, a.rx, y, a.rz, b.rx, y, b.rz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Checkered start / finish line laid across the road at sample 0.
function addStartLine(group, samples) {
  const p = samples[0], n = samples[3];
  const ang = Math.atan2(n.x - p.x, n.z - p.z);
  const px = Math.cos(ang), pz = -Math.sin(ang);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 });
  const cells = 12, cw = ROAD_WIDTH / cells, cell = new THREE.PlaneGeometry(cw, 1.6);
  for (let i = 0; i < cells; i++) {
    for (let row = 0; row < 2; row++) {
      const off = (i - (cells - 1) / 2) * cw;
      const along = (row - 0.5) * 1.6;
      const m = new THREE.Mesh(cell, (i + row) % 2 === 0 ? white : black);
      m.rotation.set(-Math.PI / 2, 0, -ang);
      m.position.set(p.x + px * off + Math.sin(ang) * along, 0.04, p.z + pz * off + Math.cos(ang) * along);
      group.add(m);
    }
  }
  const postMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5, 8), postMat);
    post.position.set(p.x + px * s * (ROAD_WIDTH / 2 + 1), 2.5, p.z + pz * s * (ROAD_WIDTH / 2 + 1));
    post.castShadow = true;
    group.add(post);
  });
}

function addClouds(group, tint) {
  const cloudMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.9, fog: false });
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
    const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 180;
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
      [[-H], [H]].forEach(([edge]) => {
        const post = new THREE.Mesh(postGeo, postMat);
        if (horizontal) post.position.set(pos, 0.65, edge); else post.position.set(edge, 0.65, pos);
        post.castShadow = true; group.add(post);
      });
      if (i < count) {
        const c = pos + seg / 2;
        [[-H], [H]].forEach(([edge]) => {
          const rail = new THREE.Mesh(horizontal ? railGeoH : railGeoV, railMat);
          if (horizontal) rail.position.set(c, 0.95, edge); else rail.position.set(edge, 0.95, c);
          rail.castShadow = true; group.add(rail);
        });
      }
    }
  };
  place(true); place(false);
}

// Dense low-poly pines: a trunk with 3 stacked cone tiers.
function addTrees(group, roadSamples, quality) {
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.9 });
  const tierGeos = [
    new THREE.ConeGeometry(2.6, 3.2, 8),
    new THREE.ConeGeometry(2.1, 2.9, 8),
    new THREE.ConeGeometry(1.5, 2.6, 8),
  ];
  const pineMats = [
    new THREE.MeshStandardMaterial({ color: 0x246b32, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x1f5e2b, roughness: 0.95, flatShading: true }),
  ];
  const clear = ROAD_WIDTH / 2 + 7;
  const near = makeRoadProximity(roadSamples, clear);
  const target = quality === 'low' ? 90 : 165; // denser forest
  let placed = 0, attempts = 0;
  while (placed < target && attempts < target * 14) {
    attempts++;
    const inner = Math.random() < 0.24;
    const r = inner ? Math.random() * 34 : 88 + Math.random() * 100;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < ARENA_HALF - 3 && Math.abs(z) < ARENA_HALF - 3 && near(x, z)) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.6; trunk.castShadow = quality !== 'low'; tree.add(trunk);
    const mat = pineMats[(Math.random() * pineMats.length) | 0];
    const t1 = new THREE.Mesh(tierGeos[0], mat); t1.position.y = 4.2; t1.castShadow = quality !== 'low'; tree.add(t1);
    const t2 = new THREE.Mesh(tierGeos[1], mat); t2.position.y = 5.8; tree.add(t2);
    const t3 = new THREE.Mesh(tierGeos[2], mat); t3.position.y = 7.2; tree.add(t3);
    tree.scale.setScalar(0.8 + Math.random() * 1.0);
    tree.position.set(x, 0, z); tree.rotation.y = Math.random() * Math.PI;
    group.add(tree); placed++;
  }
}

// Low-poly rocks scattered in the grass.
function addRocks(group, roadSamples, quality) {
  const geos = [new THREE.DodecahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1.15, 0)];
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 1, flatShading: true }),
  ];
  const near = makeRoadProximity(roadSamples, ROAD_WIDTH / 2 + 4);
  const target = quality === 'low' ? 24 : 44;
  let placed = 0, attempts = 0;
  while (placed < target && attempts < target * 14) {
    attempts++;
    const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > ARENA_HALF - 3 || Math.abs(z) > ARENA_HALF - 3 || near(x, z)) continue;
    const rock = new THREE.Mesh(geos[(Math.random() * geos.length) | 0], mats[(Math.random() * mats.length) | 0]);
    const s = 0.8 + Math.random() * 2.2;
    rock.scale.set(s, s * (0.6 + Math.random() * 0.4), s);
    rock.position.set(x, s * 0.3, z); rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = quality !== 'low';
    group.add(rock); placed++;
  }
}

// Red/white curbs along both road edges through the corners.
function addCurbs(group, samples) {
  const N = samples.length;
  const red = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.7 });
  const geo = new THREE.PlaneGeometry(1.5, 2.2);
  const curveAt = (i) => {
    const a = samples[(i - 6 + N) % N], b = samples[i], c = samples[(i + 6) % N];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    return Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
  };
  const halfIn = ROAD_WIDTH / 2 - 0.8;
  let seg = 0;
  for (let i = 0; i < N; i += 2) {
    if (curveAt(i) < 0.06) continue; // only lay curbs on corners
    const e = edgeAt(samples, i, 0);   // gives tangent angle + outward normal
    const p = samples[i];
    const mat = (seg++ % 2 === 0) ? red : white;
    for (const side of [1, -1]) {      // both edges
      const m = new THREE.Mesh(geo, mat);
      m.rotation.set(-Math.PI / 2, 0, -e.ang);
      m.position.set(p.x + e.nx * halfIn * side, 0.03, p.z + e.nz * halfIn * side);
      group.add(m);
    }
  }
}

// Stacks of tyres on the outside of the fastest / tightest corners.
function addTireBarriers(group, samples) {
  const tyreGeo = new THREE.TorusGeometry(0.6, 0.28, 6, 10);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 });
  const makeStack = (x, z) => {
    const g = new THREE.Group();
    for (let h = 0; h < 3; h++) {
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.y = 0.4 + h * 0.55;
      tyre.castShadow = true;
      g.add(tyre);
    }
    g.position.set(x, 0, z);
    group.add(g);
  };
  // Line a few tyres along the outside of the hairpin and a fast sweeper.
  for (const [a, b] of [[300, 320], [130, 150]]) {
    for (let i = a; i < b; i += 4) {
      const e = edgeAt(samples, i, 2.4);
      makeStack(e.x, e.z);
    }
  }
}

function makeRoadProximity(roadSamples, clear) {
  const c2 = clear * clear;
  return (x, z) => {
    for (let i = 0; i < roadSamples.length; i += 3) {
      const p = roadSamples[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < c2) return true;
    }
    return false;
  };
}

function edgeAt(samples, i, extra) {
  const len = samples.length;
  const p = samples[i % len], n = samples[(i + 1) % len];
  const tx = n.x - p.x, tz = n.z - p.z;
  const l = Math.hypot(tx, tz) || 1;
  let nx = tz / l, nz = -tx / l;
  if (nx * p.x + nz * p.z < 0) { nx = -nx; nz = -nz; }
  const off = ROAD_WIDTH / 2 + extra;
  return { x: p.x + nx * off, z: p.z + nz * off, ang: Math.atan2(tx, tz), nx, nz };
}

function addConesAndSigns(group, roadSamples) {
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 10);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, flatShading: true });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const baseGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10);
  for (let i = 0; i < roadSamples.length; i += 26) {
    const e = edgeAt(roadSamples, i, 1.6);
    const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(e.x, 0.55, e.z); cone.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 10), stripeMat); stripe.position.set(e.x, 0.62, e.z);
    const base = new THREE.Mesh(baseGeo, coneMat); base.position.set(e.x, 0.06, e.z);
    group.add(cone, stripe, base);
  }
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
    for (let k = -1; k <= 1; k += 2) {
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.2), arrowMat);
      a1.position.set(k * 0.35, 3.2, 0.1); a1.rotation.z = flip * 0.6 * -k; g.add(a1);
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.2), arrowMat);
      a2.position.set(k * 0.35, 2.8, 0.1); a2.rotation.z = flip * 0.6 * -k; g.add(a2);
    }
    g.position.set(e.x, 0, e.z); g.rotation.y = e.ang + Math.PI / 2;
    group.add(g);
  };
  makeChevronSign(70, 1); makeChevronSign(175, -1); makeChevronSign(295, 1);
}

function addStaticSkids(group, roadSamples) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.4, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 1.4), mat, 120);
  mesh.renderOrder = 1;
  const d = new THREE.Object3D();
  let n = 0;
  for (const [a, b] of [[40, 90], [150, 200], [255, 300]]) {
    for (let i = a; i < b && n < 120; i += 2) {
      const p = roadSamples[i % roadSamples.length];
      const nx = roadSamples[(i + 1) % roadSamples.length];
      const ang = Math.atan2(nx.x - p.x, nx.z - p.z);
      const lateral = Math.sin(i * 0.5) * ROAD_WIDTH * 0.28;
      d.position.set(p.x + Math.cos(ang) * lateral, 0.02, p.z - Math.sin(ang) * lateral);
      d.rotation.set(-Math.PI / 2, 0, -ang); d.scale.set(1, 1, 1); d.updateMatrix();
      mesh.setMatrixAt(n++, d.matrix);
    }
  }
  mesh.count = n;
  group.add(mesh);
}

function addHills(group, color) {
  const hillMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = 155 + Math.random() * 120, s = 30 + Math.random() * 55;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), hillMat);
    hill.position.set(Math.cos(a) * r, -s * 0.55, Math.sin(a) * r);
    hill.scale.y = 0.5;
    group.add(hill);
  }
}
