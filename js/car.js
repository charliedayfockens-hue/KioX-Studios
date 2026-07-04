// car.js — a polished low-poly drift car plus an arcade physics model that
// supports smooth 360 spins. Velocity lives in world space and the car's
// facing (yaw) is driven by a separate angular velocity, so the car can face
// one way while sliding another — real drifts and full 360s, with no sideways
// "shove" from the handbrake (the handbrake simply removes grip).

import * as THREE from 'three';
import { ARENA_HALF } from './world.js';

export const DEFAULT_CAR_COLOR = '#ff3b3b';

export class Car {
  constructor(scene, color = DEFAULT_CAR_COLOR) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.body = new THREE.Group(); // cosmetic roll/pitch, separate from yaw
    this.group.add(this.body);

    this._buildMesh();
    this.setBodyColor(color);

    // ---- Physics state ----
    this.startPos = new THREE.Vector3(0, 0, 30);
    this.startYaw = Math.PI;
    this.pos = this.startPos.clone();
    this.vel = new THREE.Vector3();  // world-space velocity (x,z used)
    this.yaw = this.startYaw;
    this.yawRate = 0;                // angular velocity (rad/s)
    this.wheelSpin = 0;
    this.steerAngle = 0;

    // ---- Tuning: slower, very slippery, long-gliding arcade feel ----
    this.enginePower = 26;           // slightly lower acceleration
    this.reversePower = 13;
    this.brakePower = 42;
    this.maxSpeed = 30;              // m/s — lower top speed (easier control)
    this.maxReverse = 10;
    this.rollingDrag = 0.18;         // LOW forward drag → glides ~3s off throttle
    this.velDamp = 0.035;            // tiny overall damping → momentum lasts

    // Very low grip = slippery, big angles, long slides, and little pull toward
    // the steering direction (grip is the only thing that realigns velocity).
    this.baseGrip = 0.9;             // normal lateral grip (lower → less inside pull)
    this.handbrakeGrip = 0.2;        // rear grip while handbraking (very loose)
    this.gripRecover = 2.0;          // how fast grip climbs back after a slide (slow)
    this.looseHold = 0.7;            // seconds the rear stays loose after handbrake
    this.maxLatAccel = 10;           // cap on sideways realignment (m/s^2) → gentle pull, sideways glide

    // Much snappier steering: high turn rate + very fast angular response so the
    // car flicks into drifts instantly, while damping keeps it controllable.
    this.maxYawRate = 2.2;           // steering turn rate (rad/s) — big bump
    this.handbrakeYawBoost = 1.35;   // extra authority when handbraking
    this.yawEaseGrip = 12.0;         // very fast angular accel into a turn (gripping)
    this.yawEaseDrift = 6.5;         // fast response while drifting (instant correction)
    this.yawDamp = 1.5;              // spin decay → holds angle after releasing steer

    this._loose = 0;                 // loose-rear timer
    this._grip = this.baseGrip;      // smoothed current grip (slow recovery)

    this.driftAmount = 0;            // 0..1 smoothed drift/spin intensity
    this.driftAngle = 0;
    this.speed = 0;
    this.speedKmh = 0;
  }

  // ---------------- Mesh ----------------
  _buildMesh() {
    const b = this.body;
    // Paint material shared by all body panels (the only recolored parts).
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.35, flatShading: false });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111a26, roughness: 0.15, metalness: 0.6 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6 });   // bumpers/mirrors
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.85, flatShading: true });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7dee8, roughness: 0.3, metalness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1.0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 0.9 });

    const paint = (geo, x, y, z) => { const m = new THREE.Mesh(geo, this.bodyMat); m.position.set(x, y, z); m.castShadow = true; b.add(m); return m; };
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; b.add(m); return m; };

    // ---- Lower body (with slightly tapered top via two stacked slabs) ----
    paint(new THREE.BoxGeometry(1.95, 0.42, 4.2), 0, 0.5, 0);
    paint(new THREE.BoxGeometry(1.8, 0.34, 3.9), 0, 0.82, -0.05);

    // Hood (front) and trunk (rear) — lower than the cabin
    const hood = paint(new THREE.BoxGeometry(1.72, 0.22, 1.35), 0, 0.98, 1.35);
    hood.rotation.x = -0.03;
    paint(new THREE.BoxGeometry(1.74, 0.22, 1.0), 0, 1.0, -1.55);

    // ---- Cabin / roof ----
    const roof = paint(new THREE.BoxGeometry(1.55, 0.5, 1.85), 0, 1.34, -0.15);
    // Rounded roof feel: a thinner top cap
    paint(new THREE.BoxGeometry(1.4, 0.12, 1.6), 0, 1.62, -0.15);

    // ---- Glass: windshield, rear window, side windows ----
    const windshield = part(new THREE.BoxGeometry(1.46, 0.52, 0.12), glassMat, 0, 1.28, 0.82);
    windshield.rotation.x = -0.52;
    const rearGlass = part(new THREE.BoxGeometry(1.46, 0.46, 0.12), glassMat, 0, 1.28, -1.08);
    rearGlass.rotation.x = 0.55;
    part(new THREE.BoxGeometry(0.06, 0.36, 1.5), glassMat, 0.79, 1.3, -0.15);   // left side glass
    part(new THREE.BoxGeometry(0.06, 0.36, 1.5), glassMat, -0.79, 1.3, -0.15);  // right side glass

    // ---- Bumpers ----
    part(new THREE.BoxGeometry(2.02, 0.34, 0.5), trimMat, 0, 0.46, 2.06);   // front
    part(new THREE.BoxGeometry(2.02, 0.36, 0.5), trimMat, 0, 0.5, -2.06);   // rear
    // Front splitter + rear diffuser hints
    part(new THREE.BoxGeometry(1.9, 0.08, 0.3), trimMat, 0, 0.3, 2.2);

    // ---- Lights ----
    part(new THREE.BoxGeometry(0.42, 0.2, 0.12), headMat, 0.62, 0.66, 2.28);
    part(new THREE.BoxGeometry(0.42, 0.2, 0.12), headMat, -0.62, 0.66, 2.28);
    part(new THREE.BoxGeometry(0.5, 0.18, 0.1), tailMat, 0.6, 0.78, -2.28);
    part(new THREE.BoxGeometry(0.5, 0.18, 0.1), tailMat, -0.6, 0.78, -2.28);

    // ---- Side mirrors ----
    part(new THREE.BoxGeometry(0.28, 0.14, 0.16), trimMat, 1.02, 1.12, 0.6);
    part(new THREE.BoxGeometry(0.28, 0.14, 0.16), trimMat, -1.02, 1.12, 0.6);

    // ---- Rear spoiler (drift style) ----
    part(new THREE.BoxGeometry(1.7, 0.08, 0.34), trimMat, 0, 1.2, -2.05);
    part(new THREE.BoxGeometry(0.1, 0.24, 0.1), trimMat, 0.7, 1.06, -2.02);
    part(new THREE.BoxGeometry(0.1, 0.24, 0.1), trimMat, -0.7, 1.06, -2.02);

    // ---- Wheels (tire + rim + hub) ----
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 20);
    const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 12);
    const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.46, 8);
    const spokeGeo = new THREE.BoxGeometry(0.52, 0.06, 0.06);

    const makeWheel = () => {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true; w.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; w.add(rim);
      const hub = new THREE.Mesh(hubGeo, rimMat); hub.rotation.z = Math.PI / 2; w.add(hub);
      // simple spokes
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(spokeGeo, rimMat);
        s.rotation.x = (i / 3) * Math.PI;
        w.add(s);
      }
      return w;
    };

    this.wheels = { fl: makeWheel(), fr: makeWheel(), rl: makeWheel(), rr: makeWheel() };
    const wy = 0.5, wx = 1.0, wzF = 1.42, wzR = -1.5;
    this.frontLeftPivot = new THREE.Group();
    this.frontRightPivot = new THREE.Group();
    this.frontLeftPivot.position.set(-wx, wy, wzF);
    this.frontRightPivot.position.set(wx, wy, wzF);
    this.frontLeftPivot.add(this.wheels.fl);
    this.frontRightPivot.add(this.wheels.fr);
    b.add(this.frontLeftPivot, this.frontRightPivot);
    this.wheels.rl.position.set(-wx, wy, wzR);
    this.wheels.rr.position.set(wx, wy, wzR);
    b.add(this.wheels.rl, this.wheels.rr);
  }

  // Recolor only the paint panels (shared bodyMat).
  setBodyColor(hex) {
    this.color = hex;
    this.bodyMat.color.set(hex);
  }

  setStart(start) {
    if (!start) return;
    this.startPos.set(start.x, 0, start.z);
    this.startYaw = start.yaw;
    this.reset();
  }

  reset() {
    this.pos.copy(this.startPos);
    this.pos.y = 0;
    this.vel.set(0, 0, 0);
    this.yaw = this.startYaw;
    this.yawRate = 0;
    this.driftAmount = 0;
    this._loose = 0;
    this._grip = this.baseGrip;
    this.body.rotation.set(0, 0, 0);
  }

  // ---------------- Physics ----------------
  update(dt, input) {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = sin, fz = cos;    // forward unit (XZ)
    const rx = cos, rz = -sin;   // right unit (XZ)

    // Local velocity components.
    let vLong = this.vel.x * fx + this.vel.z * fz;
    let vLat = this.vel.x * rx + this.vel.z * rz;

    // ---- Engine / brake along forward ----
    let dLong = 0;
    if (input.gas) dLong += this.enginePower * dt;
    if (input.brake) dLong -= (vLong > 0.5 ? this.brakePower : this.reversePower) * dt;
    this.vel.x += fx * dLong;
    this.vel.z += fz * dLong;

    // Clamp forward speed.
    vLong = this.vel.x * fx + this.vel.z * fz;
    if (vLong > this.maxSpeed) { const e = vLong - this.maxSpeed; this.vel.x -= fx * e; this.vel.z -= fz * e; }
    if (vLong < -this.maxReverse) { const e = vLong + this.maxReverse; this.vel.x -= fx * e; this.vel.z -= fz * e; }

    // ---- Forward rolling drag (applied along forward only) ----
    vLong = this.vel.x * fx + this.vel.z * fz;
    const longDrag = vLong * this.rollingDrag * dt;
    this.vel.x -= fx * longDrag;
    this.vel.z -= fz * longDrag;

    // ---- Lateral grip: remove part of the sideways velocity ----
    // The handbrake ONLY lowers grip (no sideways impulse → never shoved).
    // Grip is lost instantly but recovers SLOWLY, and the rear stays loose for
    // a short moment after releasing the handbrake → long, floaty slides.
    if (input.handbrake) this._loose = this.looseHold;
    else this._loose = Math.max(0, this._loose - dt);

    let targetGrip;
    if (input.handbrake) targetGrip = this.handbrakeGrip;
    else if (this._loose > 0)
      targetGrip = THREE.MathUtils.lerp(this.handbrakeGrip, this.baseGrip, 1 - this._loose / this.looseHold);
    else targetGrip = this.baseGrip;

    if (targetGrip < this._grip) this._grip = targetGrip;               // lose grip instantly
    else this._grip += (targetGrip - this._grip) * Math.min(1, this.gripRecover * dt); // regain slowly

    vLat = this.vel.x * rx + this.vel.z * rz;
    const gripLoss = Math.min(1, this._grip * dt);
    // Desired sideways removal this frame, but capped so the car is never
    // yanked hard toward the steering/inside direction — the slide comes from
    // momentum + low grip, not a big artificial side pull.
    let latRemove = vLat * gripLoss;
    const cap = this.maxLatAccel * dt;
    if (latRemove > cap) latRemove = cap;
    else if (latRemove < -cap) latRemove = -cap;
    this.vel.x -= rx * latRemove;
    this.vel.z -= rz * latRemove;

    // ---- Gentle overall damping (long momentum, stays controllable) ----
    const damp = Math.max(0, 1 - this.velDamp * dt);
    this.vel.x *= damp;
    this.vel.z *= damp;

    // ---- Total-speed cap ----
    // Clamp the WHOLE velocity (not just the forward part) so drifting while
    // thrusting can't "pump" the car past top speed. Keeps top speed honest.
    const tot = Math.hypot(this.vel.x, this.vel.z);
    if (tot > this.maxSpeed) { const f = this.maxSpeed / tot; this.vel.x *= f; this.vel.z *= f; }

    // ---- Steering → angular velocity (this rotates the car) ----
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const speedFactor = Math.min(1, speed / 5);
    // Reverse-steer ONLY when deliberately reversing at low speed (backing up).
    // During a high-speed backward DRIFT (facing backward while sliding) we keep
    // dir = 1 so the player's steering stays consistent and the car can spin
    // past 90°, hold a reverse-facing angle, and recover without a steering flip.
    const dir = (input.brake && vLong < -0.5 && speed < 9) ? -1 : 1;
    let targetYaw = input.steer * this.maxYawRate * speedFactor * dir;
    if (input.handbrake) targetYaw *= this.handbrakeYawBoost;

    const ease = input.handbrake ? this.yawEaseDrift : this.yawEaseGrip;
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, ease * dt);
    // When there's no steering input, let the spin decay smoothly (not instantly).
    if (Math.abs(input.steer) < 0.02) {
      this.yawRate *= Math.max(0, 1 - this.yawDamp * dt);
    }
    this.yaw -= this.yawRate * dt;

    // Visual steer angle — very quick front-wheel response.
    const targetSteer = input.steer * 0.7;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, 26 * dt);

    // ---- Integrate position (velocity is independent of facing) ----
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- Soft arena bounds ----
    const lim = ARENA_HALF - 2.6;
    if (this.pos.x > lim) { this.pos.x = lim; this._bounce('x'); }
    if (this.pos.x < -lim) { this.pos.x = -lim; this._bounce('x'); }
    if (this.pos.z > lim) { this.pos.z = lim; this._bounce('z'); }
    if (this.pos.z < -lim) { this.pos.z = -lim; this._bounce('z'); }

    // ---- Drift / spin metric ----
    vLong = this.vel.x * fx + this.vel.z * fz;
    vLat = this.vel.x * rx + this.vel.z * rz;
    const slip = Math.atan2(vLat, Math.abs(vLong) + 0.001);
    const raw = Math.min(1, (Math.abs(slip) / 0.5 + Math.abs(this.yawRate) / 2.4)) * Math.min(1, speed / 6);
    this.driftAmount += (raw - this.driftAmount) * Math.min(1, 9 * dt);
    this.driftAngle = slip;
    this.speed = speed;
    this.speedKmh = Math.round(speed * 3.6);

    this._applyVisuals(dt, input, vLat);
  }

  _bounce(axis) {
    // Reflect + scrub velocity into the wall; bleed some spin.
    if (axis === 'x') this.vel.x *= -0.35; else this.vel.z *= -0.35;
    this.vel.multiplyScalar(0.7);
    this.yawRate *= 0.5;
  }

  _applyVisuals(dt, input, vLat) {
    // Vertical position LOCKED — the car can never tip, roll or fly.
    this.pos.y = 0;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;

    // Subtle cosmetic lean from lateral slide + spin (kept small = planted).
    const targetRoll = THREE.MathUtils.clamp(-vLat * 0.014 - this.yawRate * 0.02, -0.12, 0.12);
    const targetPitch = THREE.MathUtils.clamp(
      (input.gas ? -0.03 : 0) + (input.brake ? 0.04 : 0),
      -0.06, 0.07
    );
    this.body.rotation.z += (targetRoll - this.body.rotation.z) * Math.min(1, 6 * dt);
    this.body.rotation.x += (targetPitch - this.body.rotation.x) * Math.min(1, 6 * dt);
    // gentle suspension bob
    this.body.position.y = Math.sin(performance.now() * 0.004) * 0.01;

    // Wheel spin from forward speed.
    const vLong = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    this.wheelSpin += vLong * dt * 2.0;
    for (const k of ['fl', 'fr', 'rl', 'rr']) this.wheels[k].rotation.x = this.wheelSpin;

    // Front wheels steer.
    this.frontLeftPivot.rotation.y = this.steerAngle;
    this.frontRightPivot.rotation.y = this.steerAngle;
  }

  getRearWheelWorldPositions() {
    const out = [];
    for (const w of [this.wheels.rl, this.wheels.rr]) {
      const p = new THREE.Vector3();
      w.getWorldPosition(p);
      p.y = 0.03;
      out.push(p);
    }
    return out;
  }
}
