// ai.js — a skilled, reliable AI driver for AI Race mode. It drives a Car by
// following the road's sample points as waypoints: it aims at the next
// waypoint, tracks the racing line (Stanley control), brakes for corners,
// handbrake-drifts the bigger ones (tire smoke + skids), accelerates on the
// straights, and respawns onto the road if it ever gets badly stuck.
//
// All behavior is driven by the easy-to-edit AI_TUNING block below.

export const AI_TUNING = {
  aiSpeed: 31,           // top speed on straights (m/s)
  cornerSpeed: 14,       // target speed through the sharpest corners (m/s)
  turnSpeed: 1.15,       // steering authority toward the racing line
  driftAngle: 0.5,       // 0..1 how eagerly/strongly it drifts corners
  grip: 8.5,             // AI car lateral grip (high → holds the line on tight corners)
  waypointReach: 5,      // how far ahead (samples) it aims the racing line
  recoveryStrength: 1.7, // steering gain when correcting back onto the road

  // Secondary knobs (rarely need changing):
  cornerSharpness: 0.5,  // curvature (rad) above which it starts a drift
  driftCooldown: 2.0,    // min seconds between drift initiations
  steerSmoothness: 15,   // higher = quicker steering corrections
  crossGain: 1.15,       // how hard it corrects back to the centerline
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
    this._stuck = 0;
    this.distToRoad = 0;
    this.input = { gas: 0, brake: 0, steer: 0, handbrake: false };
    this.enabled = true;   // false during countdown

    // The AI car uses grippier physics than the player so a simple controller
    // can hold the racing line at speed (the player's ultra-slippery grip would
    // make any line-follower understeer off). It still drifts + smokes on the
    // bigger corners via the handbrake — believable and fun, just not on rails.
    car.maxSpeed = this.t.aiSpeed;
    car.baseGrip = this.t.grip;
    car.handbrakeGrip = 0.6;
    car.maxLatAccel = 85;       // realigns hard → holds tight lines at speed
    car.rollingDrag = 0.4;
    car.maxYawRate = 2.0;
    car.velDamp = 0.04;
  }

  // Advance the target waypoint to the nearest sample ahead of the car.
  _advance() {
    const { samples, N } = this;
    const cx = this.car.pos.x, cz = this.car.pos.z;
    let best = this.idx, bestD = Infinity;
    for (let k = 0; k <= 30; k++) {
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

  _respawn() {
    const p = this.samples[this.idx], n = this.samples[(this.idx + 3) % this.N];
    this.car.pos.set(p.x, 0, p.z);
    this.car.vel.set(0, 0, 0);
    this.car.yaw = Math.atan2(n.x - p.x, n.z - p.z);
    this.car.yawRate = 0;
    this._steer = 0; this._hbTimer = 0;
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

    // --- Respawn if badly stuck (far off-track and barely moving) ---
    if (this.distToRoad > 30 && speed < 5) this._stuck += dt;
    else this._stuck = Math.max(0, this._stuck - dt * 0.5);
    if (this._stuck > 1.6) { this._respawn(); this._stuck = 0; car.update(dt, this.input); return; }

    // --- Stanley steering toward the waypoint line (heading + cross-track) ---
    const rp = samples[this.idx];
    const ahead = samples[(this.idx + t.waypointReach) % N];
    const roadHeading = Math.atan2(ahead.x - rp.x, ahead.z - rp.z);
    const headingErr = angDiff(roadHeading, car.yaw);
    const dx = car.pos.x - rp.x, dz = car.pos.z - rp.z;
    const cross = dx * Math.cos(roadHeading) - dz * Math.sin(roadHeading);
    let stanley = headingErr + Math.atan2(-t.crossGain * cross, speed + 4);
    stanley += (Math.random() - 0.5) * (1 - t.skill) * 0.1; // tiny human imperfection
    // Car convention: positive steer DECREASES yaw → command is the negative.
    let rawSteer = Math.max(-0.95, Math.min(0.95, -stanley * t.turnSpeed));
    if (Math.abs(car.yawRate) > 1.6) rawSteer *= 0.5; // anti-spin
    this._steer += (rawSteer - this._steer) * Math.min(1, t.steerSmoothness * dt);

    // --- Corner detection → target speed (looks ahead so it brakes early) ---
    const bend = Math.max(this._curvatureAhead(6), this._curvatureAhead(11) * 0.9);
    const sharp = Math.min(1, bend / 0.9);
    let targetSpeed = t.aiSpeed + (t.cornerSpeed - t.aiSpeed) * sharp;
    targetSpeed *= 0.85 + 0.15 * t.skill;

    let gas = forward < targetSpeed ? 1 : 0;
    let brake = forward > targetSpeed * 1.12 ? 1 : 0;

    // --- Drift the bigger corners (starts as the corner approaches) ---
    let handbrake = false;
    if (bend > t.cornerSharpness && speed > 15 && this._cooldown <= 0 && Math.random() < t.driftAngle) {
      this._hbTimer = 0.4 + t.driftAngle * 0.35; // stronger drifts hold the angle longer
      this._cooldown = t.driftCooldown;
    }
    if (this._hbTimer > 0) {
      this._hbTimer -= dt;
      handbrake = true;
      gas = Math.abs(headingErr) < 0.55 ? 1 : 0; // feed power toward the exit (countersteer)
      brake = 0;
    }

    // --- Keep it on the wide road ---
    if (this.distToRoad > 16) { gas *= 0.4; handbrake = false; }
    if (this.distToRoad > 26) {                 // off track → steer hard back, crawl on
      this._steer = Math.max(-1, Math.min(1, -stanley * t.recoveryStrength));
      gas = speed < 9 ? 1 : 0; brake = 0; handbrake = false;
    }
    if (speed < 2.5) { gas = 1; handbrake = false; brake = 0; } // unstick

    this.input.gas = gas;
    this.input.brake = brake;
    this.input.steer = this._steer;
    this.input.handbrake = handbrake;
    car.update(dt, this.input);
  }
}
