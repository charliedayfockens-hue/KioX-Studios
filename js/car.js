// car.js — a game-ready drift car built from primitives, plus an exaggerated
// arcade drift physics model. The mesh reads clearly front-to-back, the front
// wheels steer, all wheels spin, and the body rolls hard while drifting.

import * as THREE from 'three';
import { ARENA_HALF } from './world.js';

export const DEFAULT_CAR_COLOR = '#ff2d55';

export class Car {
  constructor(scene, color = DEFAULT_CAR_COLOR) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.body = new THREE.Group(); // holds roll/pitch, separate from yaw
    this.group.add(this.body);

    this._buildMesh();
    this.setBodyColor(color);

    // ---- Physics state ----
    this.pos = new THREE.Vector3(0, 0, 30);
    this.yaw = Math.PI;          // facing -Z initially
    this.vLong = 0;              // local forward velocity (m/s)
    this.vLat = 0;               // local lateral velocity (m/s)
    this.wheelSpin = 0;          // accumulated wheel rotation
    this.steerAngle = 0;         // visual front-wheel steer

    // ---- Tuning: exaggerated, slippery arcade feel ----
    this.enginePower = 36;       // accel force
    this.reversePower = 16;
    this.brakePower = 48;
    this.maxSpeed = 48;
    this.maxReverse = 13;
    this.turnRate = 2.75;        // rad/s at reference speed (sharper)

    // Grip is deliberately LOW so the car slides easily.
    this.baseGrip = 2.6;         // normal lateral grip (was 6.0 → much lower)
    this.handbrakeGrip = 0.45;   // grip while handbraking (near-frictionless)
    this.driftPush = 1.7;        // how much cornering throws the rear out
    this.handbrakeKick = 3.4;    // sideways impulse when handbrake is tapped
    this.rollingDrag = 0.42;     // low drag → keeps momentum while sliding

    this.driftAmount = 0;        // 0..1 smoothed drift intensity (for effects)
    this.driftAngle = 0;
    this.speed = 0;
    this.speedKmh = 0;
  }

  _buildMesh() {
    const b = this.body;

    // Chassis (lower box) — colorable body
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.2), this.bodyMat);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    b.add(chassis);

    // Cabin (upper, offset back so the front reads as the nose) — darker body shade
    this.cabinMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.45 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), this.cabinMat);
    cabin.position.set(0, 1.0, -0.25);
    cabin.castShadow = true;
    b.add(cabin);

    // Windshield / windows (dark glass — NOT recolored)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.1, metalness: 0.8 });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.6), glassMat);
    glass.position.set(0, 1.02, -0.15);
    b.add(glass);

    // Nose wedge (front indicator) — body color
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.9), this.bodyMat);
    nose.position.set(0, 0.5, 2.0);
    b.add(nose);

    // Rear spoiler (back indicator) — fixed dark
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

    // ---- Wheels (NOT recolored) ----
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

    this.wheels = { fl: makeWheel(), fr: makeWheel(), rl: makeWheel(), rr: makeWheel() };
    const wy = 0.5;
    const wx = 1.05;
    const wzF = 1.4;
    const wzR = -1.5;
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

  // Recolor only the body panels (chassis + nose + cabin). Cabin gets a
  // slightly darker shade of the same color for a two-tone look.
  setBodyColor(hex) {
    this.color = hex;
    const c = new THREE.Color(hex);
    this.bodyMat.color.copy(c);
    const darker = c.clone().multiplyScalar(0.78);
    this.cabinMat.color.copy(darker);
  }

  reset() {
    this.pos.set(0, 0, 30);
    this.yaw = Math.PI;
    this.vLong = 0;
    this.vLat = 0;
    this.driftAmount = 0;
  }

  update(dt, input) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // ---- Longitudinal forces ----
    if (input.gas) this.vLong += this.enginePower * dt;
    if (input.brake) {
      if (this.vLong > 0.5) this.vLong -= this.brakePower * dt;
      else this.vLong -= this.reversePower * dt; // reverse
    }
    // Rolling + light air drag (low → momentum is preserved).
    this.vLong -= this.vLong * this.rollingDrag * dt;
    this.vLong -= this.vLong * Math.abs(this.vLong) * 0.014 * dt;
    this.vLong = Math.max(-this.maxReverse, Math.min(this.maxSpeed, this.vLong));
    if (Math.abs(this.vLong) < 0.02 && !input.gas && !input.brake) this.vLong = 0;

    // ---- Steering ----
    const speed = Math.hypot(this.vLong, this.vLat);
    const speedFactor = Math.min(1, speed / 9); // steering bites in quickly
    const dir = this.vLong >= 0 ? 1 : -1;
    const targetSteer = input.steer * 0.6; // max visual steer (rad)
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, 10 * dt);

    const turn = input.steer * this.turnRate * speedFactor * dir;
    this.yaw -= turn * dt;

    // ---- Lateral dynamics (the drift) ----
    // Cornering hard throws the rear out (more push than before).
    this.vLat += turn * this.vLong * dt * this.driftPush;

    // Handbrake: strong sideways kick + near-zero grip.
    let grip = this.baseGrip;
    if (input.handbrake) {
      grip = this.handbrakeGrip;
      // Kick the tail out in the steer direction, scaled by speed.
      const kickDir = Math.abs(input.steer) > 0.05 ? Math.sign(input.steer) : (this.vLat >= 0 ? 1 : -1);
      this.vLat += kickDir * Math.min(Math.abs(this.vLong), 22) * this.handbrakeKick * dt;
      this.vLong -= this.vLong * 0.5 * dt; // slight scrub
    }

    // Grip bleeds lateral velocity — with breakaway so fast slides keep sliding.
    const gripDynamic = grip * (1 - Math.min(0.72, Math.abs(this.vLat) * 0.045));
    this.vLat -= this.vLat * gripDynamic * dt;
    // Clamp absurd slides.
    this.vLat = Math.max(-30, Math.min(30, this.vLat));

    // ---- Integrate position ----
    const fx = sin, fz = cos;   // forward
    const rx = cos, rz = -sin;  // right
    this.pos.x += (fx * this.vLong + rx * this.vLat) * dt;
    this.pos.z += (fz * this.vLong + rz * this.vLat) * dt;

    // ---- Arena bounds (soft wall) ----
    const lim = ARENA_HALF - 2.4;
    ['x', 'z'].forEach((ax) => {
      if (this.pos[ax] > lim) { this.pos[ax] = lim; this._bounce(); }
      if (this.pos[ax] < -lim) { this.pos[ax] = -lim; this._bounce(); }
    });

    // ---- Drift metric ----
    const driftAngle = Math.atan2(this.vLat, Math.abs(this.vLong) + 0.001);
    const rawDrift = Math.min(1, Math.abs(driftAngle) / 0.5) * Math.min(1, speed / 7);
    this.driftAmount += (rawDrift - this.driftAmount) * Math.min(1, 9 * dt);
    this.driftAngle = driftAngle;
    this.speed = speed;
    this.speedKmh = Math.round(Math.abs(this.vLong) * 3.6);

    this._applyVisuals(dt, input);
  }

  _bounce() {
    this.vLong *= 0.4;
    this.vLat *= 0.4;
  }

  _applyVisuals(dt, input) {
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;

    // Bigger, more dramatic body roll from lateral velocity.
    const targetRoll = THREE.MathUtils.clamp(-this.vLat * 0.045, -0.34, 0.34);
    const targetPitch = THREE.MathUtils.clamp(
      (input.gas ? -0.06 : 0) + (input.brake ? 0.07 : 0) + this.vLong * 0.0006,
      -0.12, 0.14
    );
    this.body.rotation.z += (targetRoll - this.body.rotation.z) * Math.min(1, 7 * dt);
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
