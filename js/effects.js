// effects.js — tire smoke particles and skid marks, both pooled so they never
// allocate during gameplay.

import * as THREE from 'three';

// ---------- Tire Smoke ----------
export class SmokePuffs {
  constructor(scene, max = 140) {
    this.max = max;
    this.enabled = true;
    const tex = makeSmokeTexture();
    this.material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0xdfe6ee,
    });
    this.pool = [];
    this.active = [];
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(this.material.clone());
      s.visible = false;
      s.scale.set(1, 1, 1);
      scene.add(s);
      this.pool.push(s);
    }
    this._t = 0;
  }

  emit(position, intensity) {
    if (!this.enabled) return;
    const s = this.pool.pop();
    if (!s) return;
    s.visible = true;
    s.position.copy(position);
    s.position.x += (Math.random() - 0.5) * 0.5;
    s.position.z += (Math.random() - 0.5) * 0.5;
    s.material.opacity = 0.35 + 0.35 * intensity;
    s.userData = {
      life: 0,
      maxLife: 0.9 + Math.random() * 0.6,
      grow: 2.2 + Math.random() * 2.0,
      vy: 0.6 + Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.8,
      vz: (Math.random() - 0.5) * 0.8,
      start: 0.6 + Math.random() * 0.4,
    };
    s.scale.setScalar(s.userData.start);
    this.active.push(s);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      const u = s.userData;
      u.life += dt;
      const t = u.life / u.maxLife;
      if (t >= 1) {
        s.visible = false;
        this.active.splice(i, 1);
        this.pool.push(s);
        continue;
      }
      s.position.y += u.vy * dt;
      s.position.x += u.vx * dt;
      s.position.z += u.vz * dt;
      s.scale.setScalar(u.start + u.grow * t);
      s.material.opacity = (0.35 + 0.35) * (1 - t) * 0.9;
    }
  }

  clear() {
    for (const s of this.active) { s.visible = false; this.pool.push(s); }
    this.active.length = 0;
  }
}

function makeSmokeTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(230,235,245,0.5)');
  g.addColorStop(1, 'rgba(230,235,245,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---------- Skid Marks ----------
// A rolling buffer of small dark quads laid on the asphalt.
export class SkidMarks {
  constructor(scene, max = 600) {
    this.max = max;
    this.enabled = true;
    this.geo = new THREE.PlaneGeometry(0.4, 0.7);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0c,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = max;
    scene.add(this.mesh);
    this._i = 0;
    this._dummy = new THREE.Object3D();
    // Hide all initially by scaling to zero.
    const zero = new THREE.Object3D();
    zero.scale.set(0, 0, 0);
    zero.updateMatrix();
    for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, zero.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  add(position, yaw) {
    if (!this.enabled) return;
    const d = this._dummy;
    d.position.set(position.x, 0.02, position.z);
    d.rotation.set(-Math.PI / 2, 0, -yaw);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    this.mesh.setMatrixAt(this._i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this._i = (this._i + 1) % this.max;
  }

  clear() {
    const zero = new THREE.Object3D();
    zero.scale.set(0, 0, 0);
    zero.updateMatrix();
    for (let k = 0; k < this.max; k++) this.mesh.setMatrixAt(k, zero.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this._i = 0;
  }
}
