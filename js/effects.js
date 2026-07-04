// effects.js — tire smoke particles and skid marks, both pooled so they never
// allocate during gameplay. Tuned bigger/stronger for an exaggerated drift look.

import * as THREE from 'three';

// ---------- Tire Smoke ----------
export class SmokePuffs {
  constructor(scene, max = 220) {
    this.max = max;
    this.enabled = true;
    const tex = makeSmokeTexture();
    this.material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      color: 0xeef2f8,
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
  }

  emit(position, intensity) {
    if (!this.enabled) return;
    const s = this.pool.pop();
    if (!s) return;
    s.visible = true;
    s.position.copy(position);
    s.position.x += (Math.random() - 0.5) * 0.7;
    s.position.z += (Math.random() - 0.5) * 0.7;
    s.position.y += 0.2;
    s.userData = {
      life: 0,
      maxLife: 1.1 + Math.random() * 0.8,
      grow: 3.6 + Math.random() * 3.0,     // bigger puffs
      vy: 0.8 + Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 1.2,
      vz: (Math.random() - 0.5) * 1.2,
      start: 0.9 + Math.random() * 0.6,
      peak: 0.5 + 0.4 * intensity,          // stronger when drifting harder
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
      // Fade in fast, then out.
      const fade = t < 0.15 ? t / 0.15 : (1 - t) / 0.85;
      s.material.opacity = u.peak * fade;
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
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(235,240,248,0.55)');
  g.addColorStop(1, 'rgba(235,240,248,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---------- Skid Marks ----------
// A rolling buffer of dark quads laid on the road. Wider + darker than before.
export class SkidMarks {
  constructor(scene, max = 900) {
    this.max = max;
    this.enabled = true;
    this.geo = new THREE.PlaneGeometry(0.55, 0.9);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0c,
      transparent: true,
      opacity: 0.78,          // stronger marks
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = max;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this._i = 0;
    this._dummy = new THREE.Object3D();
    const zero = new THREE.Object3D();
    zero.scale.set(0, 0, 0);
    zero.updateMatrix();
    for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, zero.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  add(position, yaw, intensity = 1) {
    if (!this.enabled) return;
    const d = this._dummy;
    d.position.set(position.x, 0.025, position.z);
    d.rotation.set(-Math.PI / 2, 0, -yaw);
    const w = 1 + intensity * 0.4;
    d.scale.set(w, 1.1, 1);
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
