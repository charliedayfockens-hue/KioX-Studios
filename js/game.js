// game.js — the playable drift game: renderer, follow camera, themed world,
// player car, an AI opponent (AI Race mode), effects, race rules and HUD.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Car } from './car.js';
import { SmokePuffs, SkidMarks } from './effects.js';
import { EngineAudio } from './audio.js';
import { AIController } from './ai.js';
import { input, resolveInput, releaseAll } from './controls.js';

const ZERO_INPUT = { gas: 0, brake: 0, steer: 0, handbrake: false };
const AI_COLOR = '#2f6bff';
const TOTAL_LAPS = 2;

// Tracks a car's progress (nearest road index + laps) along the loop. A lap is
// only counted after the car has passed the far side of the track ("armed"),
// so the very first crossing of the start line at spawn is never miscounted.
class Progress {
  constructor(samples) { this.s = samples; this.N = samples.length; this.reset(); }
  update(pos) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const p = this.s[i]; const dx = p.x - pos.x, dz = p.z - pos.z; const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (best > this.N * 0.4 && best < this.N * 0.65) this.armed = true; // reached the far side
    if (this.armed && this.prev > this.N * 0.7 && best < this.N * 0.3) { this.laps++; this.armed = false; }
    else if (this.prev < this.N * 0.3 && best > this.N * 0.7) { this.laps = Math.max(0, this.laps - 1); }
    this.prev = best; this.idx = best; this.dist = Math.sqrt(bd);
    this.value = this.laps * this.N + best;
  }
  reset() { this.laps = 0; this.prev = 0; this.idx = 0; this.value = 0; this.dist = 0; this.armed = false; }
}

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.running = false;
    this._raf = null;
    this._last = 0;
    this.mode = 'free';
    this.track = 'forest';
    this.driftTotal = 0;
    this.driftActiveTime = 0;
    this._pfx = { smoke: 0, skid: 0 };
    this._afx = { smoke: 0, skid: 0 };
    this.audio = new EngineAudio();
  }

  _ensureRenderer() {
    if (this.renderer) return;
    const q = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this._cacheHud();
  }

  _disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      }
    });
  }

  _buildScene() {
    const q = this.settings.quality;
    this._disposeScene();
    this.scene = new THREE.Scene();

    const world = buildWorld(this.scene, q);
    this.world = world;
    this.sun = world.sun;
    this.roadSamples = world.roadSamples;

    this.car = new Car(this.scene, this.settings.carColor);
    this.smoke = new SmokePuffs(this.scene, q === 'low' ? 110 : 240);
    this.skids = new SkidMarks(this.scene, q === 'low' ? 400 : 1000);
    this.smoke.enabled = this.settings.smoke;
    this.skids.enabled = this.settings.skids;

    this.aiCar = null; this.ai = null; this.race = null;

    if (this.mode === 'race') {
      this._setupRace(world);
    } else {
      this.car.setStart(world.start);
    }

    // Camera behind the player car.
    const cs = Math.sin(this.car.yaw), cc = Math.cos(this.car.yaw);
    this._camYaw = this.car.yaw;
    this._camPos = new THREE.Vector3(this.car.pos.x - cs * 12, 6, this.car.pos.z - cc * 12);
    this._camLook = new THREE.Vector3(this.car.pos.x + cs * 6, 1.4, this.car.pos.z + cc * 6);
    this._shake = 0;

    this.driftTotal = 0; this.driftActiveTime = 0; this._lastShownScore = -1;
    this.resize();
  }

  _setupRace(world) {
    const s = world.start;
    const bx = Math.sin(s.yaw), bz = Math.cos(s.yaw);       // forward
    const px = Math.cos(s.yaw), pz = -Math.sin(s.yaw);      // right
    // Both cars start ON the line, side by side.
    this.car.setStart({ x: s.x + px * 5.5, z: s.z + pz * 5.5, yaw: s.yaw });
    this.aiCar = new Car(this.scene, AI_COLOR);
    this.aiCar.setStart({ x: s.x - px * 5.5, z: s.z - pz * 5.5, yaw: s.yaw });
    this.ai = new AIController(this.aiCar, world.roadSamples);
    this.ai.enabled = false;

    this.playerProg = new Progress(world.roadSamples);
    this.aiProg = new Progress(world.roadSamples);
    this.playerProg.update(this.car.pos);
    this.aiProg.update(this.aiCar.pos);
    this.race = { state: 'countdown', timer: 3.2, totalLaps: TOTAL_LAPS, winner: null };
    this._showRaceHud(true);
    this._setFinish(false);
  }

  _cacheHud() {
    this.hud = {
      speed: document.getElementById('speed-value'),
      driftLabel: document.getElementById('drift-label'),
      driftCurrent: document.getElementById('drift-current'),
      driftTotal: document.getElementById('drift-total-value'),
      driftStatus: document.querySelector('.drift-status'),
      driftPanel: document.querySelector('.drift-panel'),
      raceHud: document.getElementById('race-hud'),
      lap: document.getElementById('race-lap'),
      pos: document.getElementById('race-pos'),
      countdown: document.getElementById('countdown'),
      finish: document.getElementById('race-finish'),
      finishTitle: document.getElementById('finish-title'),
      finishSub: document.getElementById('finish-sub'),
    };
  }

  _showRaceHud(on) {
    if (this.hud.raceHud) this.hud.raceHud.classList.toggle('hidden', !on);
    if (this.hud.driftPanel) this.hud.driftPanel.classList.toggle('hidden', on);
    if (!on && this.hud.countdown) this.hud.countdown.classList.add('hidden');
  }

  _setFinish(on) {
    if (this.hud.finish) this.hud.finish.classList.toggle('hidden', !on);
  }

  applySettings(settings) {
    this.settings = settings;
    if (!this.scene) return;
    this.smoke.enabled = settings.smoke;
    this.skids.enabled = settings.skids;
    this.audio.setEnabled(settings.sound);
    if (settings.carColor) this.car.setBodyColor(settings.carColor);
  }

  setCarColor(hex) { if (this.car) this.car.setBodyColor(hex); }

  start(opts = {}) {
    this.mode = opts.mode || 'free';
    this.track = 'forest'; // Desert removed — Forest is the only track
    this._ensureRenderer();
    this._buildScene();
    this._showRaceHud(this.mode === 'race');
    this.running = true;
    this._last = performance.now();
    this.audio.setEnabled(this.settings.sound);
    this.audio.start();
    this.audio.resume();
    if (typeof window !== 'undefined') window.__kiox = this;
    if (!this._raf) this._loop();
  }

  pause() { this.running = false; releaseAll(); if (this.audio) this.audio.mute(true); }
  resume() {
    if (!this.scene) return;
    this.running = true; this._last = performance.now();
    this.audio.mute(false); this.audio.resume();
    if (!this._raf) this._loop();
  }

  // "Reset" button: restart race in race mode, else recenter the car.
  resetCar() {
    if (this.mode === 'race' && this.race) { this.restartRace(); return; }
    if (!this.car) return;
    this.car.reset();
    this.driftTotal = 0; this.driftActiveTime = 0;
    this.skids.clear(); this.smoke.clear();
    if (this.hud) this.hud.driftTotal.textContent = '0';
  }

  restartRace() {
    if (!this.race) return;
    const s = this.world.start;
    const px = Math.cos(s.yaw), pz = -Math.sin(s.yaw);
    this.car.setStart({ x: s.x + px * 5.5, z: s.z + pz * 5.5, yaw: s.yaw });
    this.aiCar.setStart({ x: s.x - px * 5.5, z: s.z - pz * 5.5, yaw: s.yaw });
    this.ai.idx = 0; this.ai.enabled = false;
    this.playerProg.reset(); this.aiProg.reset();
    this.playerProg.update(this.car.pos); this.aiProg.update(this.aiCar.pos);
    this.skids.clear(); this.smoke.clear();
    this.race.state = 'countdown'; this.race.timer = 3.2; this.race.winner = null;
    this._setFinish(false);
    this.resume();
  }

  stop() {
    this.running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    releaseAll();
    if (this.audio) this.audio.mute(true);
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.running) this._update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    const countdown = this.race && this.race.state === 'countdown';
    const finished = this.race && this.race.state === 'finished';

    // Player input (frozen during countdown / after finish).
    resolveInput(dt);
    this.car.update(dt, (countdown || finished) ? ZERO_INPUT : input);

    // AI (its controller idles until enabled at GO).
    if (this.ai) this.ai.update(dt);

    if (this.race) this._updateRace(dt);

    if (this.world.update) this.world.update(dt);

    // Sun shadow follows the player.
    this.sun.position.set(this.car.pos.x + 60, 90, this.car.pos.z + 30);
    this.sun.target.position.copy(this.car.pos);

    this._updateCamera(dt);
    this._carEffects(dt, this.car, this._pfx);
    if (this.aiCar) this._carEffects(dt, this.aiCar, this._afx);
    this._updateAudio();
    this._updateHud(dt);
    this.smoke.update(dt);
  }

  _updateRace(dt) {
    const r = this.race;
    this.playerProg.update(this.car.pos);
    this.aiProg.update(this.aiCar.pos);

    if (r.state === 'countdown') {
      r.timer -= dt;
      const c = Math.ceil(r.timer);
      const txt = c >= 1 ? String(c) : 'GO!';
      const el = this.hud.countdown;
      if (el) {
        el.classList.remove('hidden');
        if (txt !== this._lastCount) {           // re-pop on each change
          el.textContent = txt;
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
          this._lastCount = txt;
        }
      }
      if (r.timer < -0.6) {
        r.state = 'racing';
        this.ai.enabled = true;
        if (this.hud.countdown) this.hud.countdown.classList.add('hidden');
      }
    } else if (r.state === 'racing') {
      const pDone = this.playerProg.laps >= r.totalLaps;
      const aDone = this.aiProg.laps >= r.totalLaps;
      if (pDone || aDone) {
        r.state = 'finished';
        r.winner = pDone ? 'player' : 'ai';
        this._showFinish(r.winner);
      }
    }
  }

  _showFinish(winner) {
    if (this.hud.finishTitle) this.hud.finishTitle.textContent = winner === 'player' ? '🏆 You Win!' : 'AI Wins';
    if (this.hud.finishSub) this.hud.finishSub.textContent = winner === 'player' ? 'Clean driving out there.' : 'So close — try again!';
    this._setFinish(true);
  }

  _updateCamera(dt) {
    const car = this.car;
    const targetHeading = car.speed > 2 ? Math.atan2(car.vel.x, car.vel.z) : car.yaw;
    let dAng = targetHeading - this._camYaw;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
    this._camYaw += dAng * Math.min(1, 3.2 * dt);
    const sin = Math.sin(this._camYaw), cos = Math.cos(this._camYaw);
    const back = 11 + car.speed * 0.12, height = 5.2 + car.speed * 0.03;
    const desired = new THREE.Vector3(car.pos.x - sin * back, car.pos.y + height, car.pos.z - cos * back);
    this._camPos.lerp(desired, 1 - Math.pow(0.0025, dt));
    const lookAt = new THREE.Vector3(car.pos.x + sin * 5, car.pos.y + 1.4, car.pos.z + cos * 5);
    this._camLook.lerp(lookAt, 1 - Math.pow(0.003, dt));

    let shakeX = 0, shakeY = 0;
    if (this.settings.shake) {
      this._shake = car.driftAmount * Math.min(1, car.speed / 20) * 0.25;
      shakeX = (Math.random() - 0.5) * this._shake;
      shakeY = (Math.random() - 0.5) * this._shake;
    }
    this.camera.position.set(this._camPos.x + shakeX, this._camPos.y + shakeY, this._camPos.z);
    this.camera.lookAt(this._camLook);
  }

  // Tire smoke + skid marks for any car (player or AI).
  _carEffects(dt, car, fx) {
    const drifting = car.driftAmount > 0.12 && car.speed > 3.5;
    if (!drifting) return;
    const rears = car.getRearWheelWorldPositions();
    fx.smoke -= dt;
    if (fx.smoke <= 0) {
      const puffs = car.driftAmount > 0.55 ? 2 : 1;
      for (const p of rears) for (let k = 0; k < puffs; k++) this.smoke.emit(p, car.driftAmount);
      fx.smoke = Math.max(0.004, 0.016 - car.driftAmount * 0.012);
    }
    fx.skid -= dt;
    if (fx.skid <= 0) {
      for (const p of rears) this.skids.add(p, car.yaw, car.driftAmount);
      fx.skid = 0.018;
    }
  }

  _updateAudio() {
    const car = this.car;
    this.audio.update(Math.min(1, car.speed / car.maxSpeed), input.gas, car.driftAmount);
  }

  _updateHud(dt) {
    const car = this.car;
    this.hud.speed.textContent = car.speedKmh;

    if (this.mode === 'race' && this.race) {
      const lap = Math.min(this.race.totalLaps, this.playerProg.laps + 1);
      if (this.hud.lap) this.hud.lap.textContent = `LAP ${lap}/${this.race.totalLaps}`;
      const first = this.playerProg.value >= this.aiProg.value;
      if (this.hud.pos) {
        this.hud.pos.textContent = first ? '1st' : '2nd';
        this.hud.pos.classList.toggle('lead', first);
      }
      return;
    }

    // Free Drift score HUD.
    const drifting = car.driftAmount > 0.14 && car.speed > 3.5;
    if (drifting) {
      this.driftTotal += car.driftAmount * car.speed * dt * 10;
      this.driftActiveTime += dt;
      this.hud.driftStatus.classList.add('active');
      this.hud.driftLabel.textContent = 'DRIFT!';
      this.hud.driftCurrent.textContent = `${Math.round(car.driftAmount * 100)}° · x${(1 + this.driftActiveTime * 0.4).toFixed(1)}`;
    } else {
      this.driftActiveTime = 0;
      this.hud.driftStatus.classList.remove('active');
      this.hud.driftLabel.textContent = car.speedKmh > 5 ? 'DRIVING' : 'READY';
      this.hud.driftCurrent.textContent = '';
    }
    const shown = Math.round(this.driftTotal);
    if (shown !== this._lastShownScore) {
      this.hud.driftTotal.textContent = shown.toLocaleString();
      if (drifting) { const el = this.hud.driftTotal; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      this._lastShownScore = shown;
    }
  }
}
