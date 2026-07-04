// ai.js — a skilled AI driver for AI Race mode. It drives a normal Car (same
// arcade physics as the player) by producing throttle/brake/steer/handbrake
// each frame from the road path: it looks ahead, picks a racing line, slows
// for sharp corners, drifts through them with the handbrake, and accelerates
// on exit. All behavior is driven by the easy-to-edit AI_TUNING below.

// ---- Easy-to-edit AI tuning (challenging but beatable) ----
export const AI_TUNING = {
  topSpeed: 32,          // m/s the AI chases on straights
  cornerSpeed: 21,       // m/s target through the sharpest corners
  driftStrength: 0.42,   // 0..1 how eagerly it handbrake-drifts sharp corners
  steerSmoothness: 12,   // higher = quicker steering corrections
  steerGain: 0.95,       // overall steering authority (Stanley output scale)
  crossGain: 0.9,        // how hard it corrects back to the centerline
  brakingSharpness: 0.6, // curvature above which it drifts the corner (rad)
  driftCooldown: 2.4,    // min seconds between drift initiations
  skill: 0.9,            // 0..1 overall competence (lower = more mistakes)
};

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class AIController {
  constructor(car, roadSamples, tuning = {}) {
    this.car = car;
    this.samples = roadSamples;
    this.N = roadSamples.length;
    this.t = { ...AI_TUNING, ...tuning };
    this.idx = 0;
    this._steer = 0;
    this._hbTimer = 0;
    this._cooldown = 0;
    this.distToRoad = 0;
    this.input = { gas: 0, brake: 0, steer: 0, handbrake: false };
    this.enabled = true;   // false during countdown

    // The AI car uses grippier physics than the player so it can hold the
    // racing line at speed (the player's ultra-slippery grip would make any
    // simple AI understeer off every corner). It still drifts + smokes on the
    // sharp corners via the handbrake — believable and fun, just not on rails.
    car.maxSpeed = this.t.topSpeed;
    car.baseGrip = 4.6;         // grippy → holds the line fast and clean
    car.handbrakeGrip = 0.55;   // still slides when handbraking sharp corners
    car.maxLatAccel = 48;       // realigns hard → stays on the road at speed
    car.rollingDrag = 0.4;      // keeps pace on straights
    car.maxYawRate = 1.9;       // turns in crisply at speed
    car.velDamp = 0.04;
  }

  _advance() {
    const { samples, N } = this;
    const cx = this.car.pos.x, cz = this.car.pos.z;
    let best = this.idx, bestD = Infinity;
    for (let k = 0; k <= 28; k++) {
      const i = (this.idx + k) % N;
      const p = samples[i];
      const dx = p.x - cx, dz = p.z - cz;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.idx = best;
    this.distToRoad = Math.sqrt(bestD);
  }

  _curvatureAhead(span) {
    const { samples, N } = this;
    const a = samples[(this.idx + 5) % N];
    const b = samples[(this.idx + 5 + span) % N];
    const c = samples[(this.idx + 5 + 2 * span) % N];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z);
    const h2 = Math.atan2(c.x - b.x, c.z - b.z);
    return Math.abs(angDiff(h2, h1));
  }

  update(dt) {
    const car = this.car;
    if (!this.enabled) {
      this.input.gas = 0; this.input.brake = 0; this.input.steer = 0; this.input.handbrake = false;
      car.update(dt, this.input);
      return;
    }

    this._advance();
    const { samples, N, t } = this;
    this._cooldown -= dt;

    const speed = car.speed;
    const forward = car.vel.x * Math.sin(car.yaw) + car.vel.z * Math.cos(car.yaw);

    // --- Stanley steering: track the centerline (heading error + cross-track) ---
    const rp = samples[this.idx];
    const ahead = samples[(this.idx + 3) % N];
    const roadHeading = Math.atan2(ahead.x - rp.x, ahead.z - rp.z);
    const headingErr = angDiff(roadHeading, car.yaw);
    // signed lateral offset from the centerline (right of road heading is +)
    const dx = car.pos.x - rp.x, dz = car.pos.z - rp.z;
    const cross = dx * Math.cos(roadHeading) - dz * Math.sin(roadHeading);
    let stanley = headingErr + Math.atan2(-t.crossGain * cross, speed + 4);
    stanley += (Math.random() - 0.5) * (1 - t.skill) * 0.12; // tiny human imperfection
    // Car convention: positive steer DECREASES yaw, so command is the negative
    // of the desired yaw change.
    let rawSteer = Math.max(-0.9, Math.min(0.9, -stanley * t.steerGain));
    if (Math.abs(car.yawRate) > 1.5) rawSteer *= 0.5; // anti-spin
    this._steer += (rawSteer - this._steer) * Math.min(1, t.steerSmoothness * dt);

    // --- Corner detection → target speed (look a bit further for braking) ---
    const bend = Math.max(this._curvatureAhead(7), this._curvatureAhead(12) * 0.85);
    const sharp = Math.min(1, bend / 1.15);
    let targetSpeed = t.topSpeed + (t.cornerSpeed - t.topSpeed) * sharp;
    targetSpeed *= 0.85 + 0.15 * t.skill;

    let gas = forward < targetSpeed ? 1 : 0;
    let brake = forward > targetSpeed * 1.12 ? 1 : 0;

    // --- Occasional handbrake drift on the sharpest corners (with cooldown) ---
    let handbrake = false;
    if (bend > t.brakingSharpness && speed > 15 && this._cooldown <= 0 && Math.random() < t.driftStrength) {
      this._hbTimer = 0.45;
      this._cooldown = t.driftCooldown;
    }
    if (this._hbTimer > 0) {
      this._hbTimer -= dt;
      handbrake = true;
      gas = Math.abs(headingErr) < 0.5 ? 1 : 0;
      brake = 0;
    }

    // --- Keep it on the wide road ---
    if (this.distToRoad > 15) { gas *= 0.4; handbrake = false; }  // drifting wide → ease off
    if (this.distToRoad > 26) { gas = speed < 8 ? 1 : 0; brake = 0; } // off track → crawl back
    if (speed < 2.5) { gas = 1; handbrake = false; brake = 0; }   // unstick

    this.input.gas = gas;
    this.input.brake = brake;
    this.input.steer = this._steer;
    this.input.handbrake = handbrake;
    car.update(dt, this.input);
  }
}
