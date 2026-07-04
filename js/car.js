// car.js — a game-ready drift car built from primitives, plus an arcade
// drift physics model. The mesh reads clearly front-to-back, the front
// wheels steer, all wheels spin, and the body rolls/pitches while driving.

import * as THREE from 'three';
import { ARENA_HALF } from './world.js';

export class Car {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.body = new THREE.Group(); // holds roll/pitch, separate from yaw
    this.group.add(this.body);

    this._buildMesh();

    // ---- Physics state ----
    this.pos = new THREE.Vector3(0, 0, 30);
    this.yaw = Math.PI;          // facing -Z initially
    this.vLong = 0;              // local forward velocity (m/s)
    this.vLat = 0;               // local lateral velocity (m/s)
    this.wheelSpin = 0;          // accumulated wheel rotation
    this.steerAngle = 0;         // visual front-wheel steer

    // Tuning (arcade feel).
    this.enginePower = 34;       // accel force
    this.reversePower = 16;
    this.brakePower = 46;
    this.maxSpeed = 46;
    this.maxReverse = 12;
    this.turnRate = 2.3;         // rad/s at reference speed
    this.gripLat = 6.0;          // how fast lateral velocity bleeds (grip)
    this.driftGrip = 1.6;        // grip while handbraking
    this.rollingDrag = 0.6;

    this.driftAmount = 0;        // 0..1 smoothed drift intensity (for effects)
    this.speedKmh = 0;
  }

  _buildMesh() {
    const b = this.body;

    // Chassis (lower box)
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xff2d55, roughness: 0.35, metalness: 0.5 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.2), chassisMat);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    b.add(chassis);

    // Cabin (upper, offset back so the front reads as the nose)
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xd6183d, roughness: 0.3, metalness: 0.5 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), cabinMat);
    cabin.position.set(0, 1.0, -0.25);
    cabin.castShadow = true;
    b.add(cabin);

    // Windshield / windows (dark glass)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.1, metalness: 0.8 });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.6), glassMat);
    glass.position.set(0, 1.02, -0.15);
    b.add(glass);

    // Nose wedge (front indicator)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.9), chassisMat);
    nose.position.set(0, 0.5, 2.0);
    b.add(nose);

    // Rear spoiler (back indicator)
    const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.5 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), spoilerMat);
    wing.position.set(0, 1.15, -2.05);
    b.add(wing);
    [-0.8, 0.8].forEach((x) => {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), spoilerMat);
      stalk.position.set(x, 0.95, -2.05);
      b.add(stalk);
    });

    // Headlights (front) & taillights (back)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.9 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.8 });
    [-0.65, 0.65].forEach((x) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
      hl.position.set(x, 0.6, 2.42);
      b.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tailMat);
      tl.position.set(x, 0.75, -2.32);
      b.add(tl);
    });

    // ---- Wheels ----
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.8 });

    const makeWheel = () => {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      w.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 8), rimMat);
      rim.rotation.z = Math.PI / 2;
      w.add(rim);
      return w;
    };

    // wheel positions: FL, FR, RL, RR
    this.wheels = { fl: makeWheel(), fr: makeWheel(), rl: makeWheel(), rr: makeWheel() };
    const wy = 0.5;
    const wx = 1.05;
    const wzF = 1.4;
    const wzR = -1.5;
    // Front wheels get a steer pivot group.
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

  reset() {
    this.pos.set(0, 0, 30);
    this.yaw = Math.PI;
    this.vLong = 0;
    this.vLat = 0;
    this.driftAmount = 0;
  }

  update(dt, input) {
    // Local direction basis from yaw.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (sin, cos) in XZ ... we use +Z as forward reference below.
    // We'll treat forward as (Math.sin(yaw), Math.cos(yaw)).

    // ---- Longitudinal forces ----
    if (input.gas) {
      this.vLong += this.enginePower * dt;
    }
    if (input.brake) {
      if (this.vLong > 0.5) {
        this.vLong -= this.brakePower * dt;
      } else {
        this.vLong -= this.reversePower * dt; // reverse
      }
    }
    // Rolling drag + light air drag.
    this.vLong -= this.vLong * this.rollingDrag * dt;
    this.vLong -= this.vLong * Math.abs(this.vLong) * 0.0016 * dt * 10;

    // Clamp speed.
    this.vLong = Math.max(-this.maxReverse, Math.min(this.maxSpeed, this.vLong));
    if (Math.abs(this.vLong) < 0.02 && !input.gas && !input.brake) this.vLong = 0;

    // ---- Steering ----
    const speed = Math.hypot(this.vLong, this.vLat);
    // Steering effectiveness scales with speed but caps out.
    const speedFactor = Math.min(1, speed / 12);
    const dir = this.vLong >= 0 ? 1 : -1;
    const targetSteer = input.steer * 0.55; // max visual steer (rad)
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, 10 * dt);

    const turn = input.steer * this.turnRate * speedFactor * dir;
    this.yaw -= turn * dt;

    // ---- Lateral dynamics (the drift) ----
    // Turning injects lateral velocity; grip bleeds it away.
    this.vLat += turn * this.vLong * dt * 0.9;

    let grip = this.gripLat;
    if (input.handbrake) grip = this.driftGrip;
    // Less grip at higher lateral speed (breakaway), more grip when slow.
    const gripDynamic = grip * (1 - Math.min(0.55, Math.abs(this.vLat) * 0.03));
    this.vLat -= this.vLat * gripDynamic * dt;

    // Handbrake also scrubs a little forward speed.
    if (input.handbrake) this.vLong -= this.vLong * 0.6 * dt;

    // ---- Integrate position ----
    // forward vector (sin,cos), right vector (cos,-sin)
    const fx = sin, fz = cos;
    const rx = cos, rz = -sin;
    this.pos.x += (fx * this.vLong + rx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + rz * this.vLat) * dt;

    // ---- Arena bounds (soft wall) ----
    const lim = ARENA_HALF - 2.4;
    ['x', 'z'].forEach((ax) => {
      if (this.pos[ax] > lim) { this.pos[ax] = lim; this._bounce(ax); }
      if (this.pos[ax] < -lim) { this.pos[ax] = -lim; this._bounce(ax); }
    });

    // ---- Drift metric ----
    const driftAngle = Math.atan2(this.vLat, Math.abs(this.vLong) + 0.001);
    const rawDrift = Math.min(1, Math.abs(driftAngle) / 0.6) * Math.min(1, speed / 8);
    this.driftAmount += (rawDrift - this.driftAmount) * Math.min(1, 8 * dt);
    this.driftAngle = driftAngle;
    this.speed = speed;
    this.speedKmh = Math.round(Math.abs(this.vLong) * 3.6);

    this._applyVisuals(dt, input);
  }

  _bounce(axis) {
    // Kill velocity into the wall and add a small scrub.
    this.vLong *= 0.4;
    this.vLat *= 0.4;
  }

  _applyVisuals(dt, input) {
    // Position + yaw
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;

    // Body roll from lateral velocity, pitch from acceleration.
    const targetRoll = THREE.MathUtils.clamp(-this.vLat * 0.03, -0.22, 0.22);
    const targetPitch = THREE.MathUtils.clamp(
      (input.gas ? -0.05 : 0) + (input.brake ? 0.06 : 0) + this.vLong * 0.0006,
      -0.1, 0.12
    );
    this.body.rotation.z += (targetRoll - this.body.rotation.z) * Math.min(1, 6 * dt);
    this.body.rotation.x += (targetPitch - this.body.rotation.x) * Math.min(1, 6 * dt);

    // Wheel spin proportional to forward speed.
    this.wheelSpin += this.vLong * dt * 2.0;
    const spin = this.wheelSpin;
    this.wheels.fl.rotation.x = spin;
    this.wheels.fr.rotation.x = spin;
    this.wheels.rl.rotation.x = spin;
    this.wheels.rr.rotation.x = spin;

    // Front wheel steering.
    this.frontLeftPivot.rotation.y = this.steerAngle;
    this.frontRightPivot.rotation.y = this.steerAngle;
  }

  // World positions of the two rear wheels (for smoke + skids).
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
