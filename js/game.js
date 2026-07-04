// game.js — the playable drift game: renderer, follow camera, world, car,
// effects, HUD updates and the main loop.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Car } from './car.js';
import { SmokePuffs, SkidMarks } from './effects.js';
import { EngineAudio } from './audio.js';
import { input, resolveInput, releaseAll } from './controls.js';

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.running = false;
    this.built = false;
    this._raf = null;
    this._last = 0;
    this.driftTotal = 0;
    this.driftActiveTime = 0;
    this._skidTimer = 0;

    this.audio = new EngineAudio();
  }

  build() {
    if (this.built) return;
    const q = this.settings.quality;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: q !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.camera.position.set(0, 8, 45);

    const { sun, start } = buildWorld(this.scene, q);
    this.sun = sun;

    this.car = new Car(this.scene, this.settings.carColor);
    this.car.setStart(start);
    this.smoke = new SmokePuffs(this.scene, q === 'low' ? 110 : 220);
    this.skids = new SkidMarks(this.scene, q === 'low' ? 400 : 900);

    this.smoke.enabled = this.settings.smoke;
    this.skids.enabled = this.settings.skids;

    // Camera state (smoothed follow) — start it behind the car.
    const cs = Math.sin(this.car.yaw), cc = Math.cos(this.car.yaw);
    this._camYaw = this.car.yaw;
    this._camPos = new THREE.Vector3(this.car.pos.x - cs * 12, 6, this.car.pos.z - cc * 12);
    this._camLook = new THREE.Vector3(this.car.pos.x + cs * 6, 1.4, this.car.pos.z + cc * 6);
    this._shake = 0;

    this._cacheHud();
    this.resize();
    this.built = true;
  }

  _cacheHud() {
    this.hud = {
      speed: document.getElementById('speed-value'),
      driftLabel: document.getElementById('drift-label'),
      driftCurrent: document.getElementById('drift-current'),
      driftTotal: document.getElementById('drift-total-value'),
      driftStatus: document.querySelector('.drift-status'),
    };
  }

  applySettings(settings) {
    this.settings = settings;
    if (!this.built) return;
    this.smoke.enabled = settings.smoke;
    this.skids.enabled = settings.skids;
    this.audio.setEnabled(settings.sound);
    if (settings.carColor) this.car.setBodyColor(settings.carColor);
  }

  setCarColor(hex) {
    if (this.car) this.car.setBodyColor(hex);
  }

  start() {
    this.build();
    this.running = true;
    this._last = performance.now();
    this.audio.setEnabled(this.settings.sound);
    this.audio.start();
    this.audio.resume();
    if (typeof window !== 'undefined') window.__kiox = this; // debug/telemetry handle
    if (!this._raf) this._loop();
  }

  pause() {
    this.running = false;
    releaseAll();
    if (this.audio) this.audio.mute(true);
  }

  resume() {
    if (!this.built) return;
    this.running = true;
    this._last = performance.now();
    this.audio.mute(false);
    this.audio.resume();
    if (!this._raf) this._loop();
  }

  resetCar() {
    if (!this.car) return;
    this.car.reset();
    this.driftTotal = 0;
    this.driftActiveTime = 0;
    this.skids.clear();
    this.smoke.clear();
    if (this.hud) this.hud.driftTotal.textContent = '0';
  }

  stop() {
    this.running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    releaseAll();
    if (this.audio) this.audio.mute(true);
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps

    if (this.running) {
      this._update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    resolveInput(dt);
    this.car.update(dt, input);

    // Keep the sun shadow frustum centered on the car.
    this.sun.position.set(this.car.pos.x + 60, 90, this.car.pos.z + 30);
    this.sun.target.position.copy(this.car.pos);

    this._updateCamera(dt);
    this._updateEffects(dt);
    this._updateAudio();
    this._updateHud(dt);
    this.smoke.update(dt);
  }

  _updateCamera(dt) {
    const car = this.car;

    // Follow the direction of TRAVEL (velocity) when moving, so a 360 spin
    // rotates the car in view instead of whipping the whole world around.
    // Fall back to the car's facing when nearly stopped.
    const targetHeading = car.speed > 2 ? Math.atan2(car.vel.x, car.vel.z) : car.yaw;
    let dAng = targetHeading - this._camYaw;
    dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng)); // shortest angle
    this._camYaw += dAng * Math.min(1, 3.2 * dt);      // slow → smooth in spins
    const sin = Math.sin(this._camYaw);
    const cos = Math.cos(this._camYaw);

    const back = 11 + car.speed * 0.12;
    const height = 5.2 + car.speed * 0.03;
    const desired = new THREE.Vector3(
      car.pos.x - sin * back,
      car.pos.y + height,
      car.pos.z - cos * back
    );
    this._camPos.lerp(desired, 1 - Math.pow(0.0025, dt));

    // Look slightly ahead along the travel heading.
    const lookAt = new THREE.Vector3(
      car.pos.x + sin * 5,
      car.pos.y + 1.4,
      car.pos.z + cos * 5
    );
    this._camLook.lerp(lookAt, 1 - Math.pow(0.003, dt));

    // Camera shake scaled by drift + speed.
    let shakeX = 0, shakeY = 0;
    if (this.settings.shake) {
      this._shake = car.driftAmount * Math.min(1, car.speed / 20) * 0.25;
      shakeX = (Math.random() - 0.5) * this._shake;
      shakeY = (Math.random() - 0.5) * this._shake;
    }

    this.camera.position.set(this._camPos.x + shakeX, this._camPos.y + shakeY, this._camPos.z);
    this.camera.lookAt(this._camLook);
  }

  _updateEffects(dt) {
    const car = this.car;
    // Lower threshold + emit more so slides always smoke.
    const drifting = car.driftAmount > 0.12 && car.speed > 3.5;

    if (drifting) {
      const rears = car.getRearWheelWorldPositions();
      // Faster smoke emission that scales with drift intensity.
      const rate = 0.016 - car.driftAmount * 0.012;
      this._smokeTimer = (this._smokeTimer || 0) - dt;
      if (this._smokeTimer <= 0) {
        // Emit an extra puff per wheel when drifting hard.
        const puffs = car.driftAmount > 0.55 ? 2 : 1;
        for (const p of rears) {
          for (let k = 0; k < puffs; k++) this.smoke.emit(p, car.driftAmount);
        }
        this._smokeTimer = Math.max(0.004, rate);
      }
      // Stronger skid marks laid at a fixed interval.
      this._skidTimer -= dt;
      if (this._skidTimer <= 0) {
        for (const p of rears) this.skids.add(p, car.yaw, car.driftAmount);
        this._skidTimer = 0.018;
      }
    }
  }

  _updateAudio() {
    const car = this.car;
    const speed01 = Math.min(1, car.speed / car.maxSpeed);
    this.audio.update(speed01, input.gas, car.driftAmount);
  }

  _updateHud(dt) {
    const car = this.car;
    this.hud.speed.textContent = car.speedKmh;

    const drifting = car.driftAmount > 0.14 && car.speed > 3.5;
    if (drifting) {
      // Score scales with drift angle and speed.
      const gain = car.driftAmount * car.speed * dt * 10;
      this.driftTotal += gain;
      this.driftActiveTime += dt;
      this.hud.driftStatus.classList.add('active');
      this.hud.driftLabel.textContent = 'DRIFT!';
      this.hud.driftCurrent.textContent =
        `${Math.round(car.driftAmount * 100)}° · x${(1 + this.driftActiveTime * 0.4).toFixed(1)}`;
    } else {
      this.driftActiveTime = 0;
      this.hud.driftStatus.classList.remove('active');
      this.hud.driftLabel.textContent = car.speedKmh > 5 ? 'DRIVING' : 'READY';
      this.hud.driftCurrent.textContent = '';
    }

    const shown = Math.round(this.driftTotal);
    if (shown !== this._lastShownScore) {
      this.hud.driftTotal.textContent = shown.toLocaleString();
      // Bounce the score when it increases.
      if (drifting) {
        const el = this.hud.driftTotal;
        el.classList.remove('bump');
        void el.offsetWidth; // restart animation
        el.classList.add('bump');
      }
      this._lastShownScore = shown;
    }
  }
}
