// ui.js — menus, settings, fullscreen/orientation handling, the animated
// 3D car preview on the main menu, the car-color picker, and transitions.

import * as THREE from 'three';
import { Car, DEFAULT_CAR_COLOR } from './car.js';

const LS_KEY = 'kiox-drift-settings';

export const settings = loadSettings();

function loadSettings() {
  const def = {
    sound: true, smoke: true, skids: true, shake: true,
    quality: 'medium', carColor: DEFAULT_CAR_COLOR,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { ...def, ...saved };
  } catch {
    return def;
  }
}

export function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {}
}

// ---------- Menu 3D preview ----------
export class MenuPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 14, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(6, 3.4, 7.5);
    this.camera.lookAt(0, 0.8, 0);

    this.scene.add(new THREE.HemisphereLight(0x8090ff, 0x101018, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(5, 8, 4);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x00e5ff, 2.4, 30); rim.position.set(-6, 2, -4); this.scene.add(rim);
    const rim2 = new THREE.PointLight(0xff2d75, 2.0, 30); rim2.position.set(6, 1, -5); this.scene.add(rim2);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.35, metalness: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x00e5ff, 0x1c2436);
    grid.material.opacity = 0.3; grid.material.transparent = true;
    this.scene.add(grid);

    this.car = new Car(this.scene, settings.carColor);
    this.car.group.position.set(0, 0, 0);
    this.car.body.rotation.set(0, 0, 0);

    this.spin = 0;
    this.running = true;
    this._last = performance.now();
    this.resize();
    this._loop();
  }

  setCarColor(hex) { this.car.setBodyColor(hex); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setRunning(on) {
    this.running = on;
    if (on) { this._last = performance.now(); this._loop(); }
  }

  _loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    this.spin += dt * 0.5;
    this.car.group.rotation.y = this.spin;
    this.car.body.position.y = Math.sin(now * 0.002) * 0.03;
    for (const k of ['fl', 'fr', 'rl', 'rr']) this.car.wheels[k].rotation.x += dt * 0.4;

    this.renderer.render(this.scene, this.camera);
  };
}

// ---------- Fullscreen + orientation ----------
// Returns a status object; never throws. Falls back to the rotate hint / a
// toast when true fullscreen or orientation lock isn't available.
export async function goFullscreen() {
  const target = document.getElementById('game') || document.documentElement;
  const status = { fullscreen: false, orientation: false, supported: false };

  const reqFs =
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.webkitRequestFullScreen ||
    target.msRequestFullscreen;

  const inFs = document.fullscreenElement || document.webkitFullscreenElement;

  try {
    if (reqFs) {
      status.supported = true;
      if (!inFs) {
        const p = reqFs.call(target, { navigationUI: 'hide' });
        if (p && p.then) await p;
        status.fullscreen = true;
      } else {
        status.fullscreen = true;
      }
    }
  } catch (e) {
    // Some browsers reject even when the API exists (e.g. permissions).
    status.fullscreen = false;
  }

  // Try to lock orientation to landscape (Android Chrome). iOS Safari has no
  // support — we simply fall back to the rotate hint.
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
      status.orientation = true;
    }
  } catch (e) {
    status.orientation = false;
  }

  // Feedback / fallback so the button never silently fails.
  if (!status.supported && !status.orientation) {
    toast('Fullscreen not supported here — rotate your phone sideways 📱');
  } else if (isPortrait()) {
    toast('Rotate your phone sideways for the best experience 📱');
  } else {
    toast('Fullscreen on ✔');
  }
  return status;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function isPortrait() {
  return window.matchMedia('(orientation: portrait)').matches;
}

// ---------- Toast ----------
let toastEl = null;
let toastTimer = null;
export function toast(msg, ms = 2200) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    Object.assign(toastEl.style, {
      position: 'fixed', left: '50%', bottom: '84px', transform: 'translateX(-50%) translateY(20px)',
      background: 'rgba(16,24,44,0.95)', color: '#eaf2ff', padding: '12px 20px',
      borderRadius: '16px', font: '800 15px system-ui, sans-serif', zIndex: '80',
      border: '2px solid rgba(255,255,255,0.14)', boxShadow: '0 10px 26px rgba(0,0,0,0.5)',
      opacity: '0', transition: 'opacity .2s ease, transform .2s cubic-bezier(.34,1.6,.64,1)',
      maxWidth: '86vw', textAlign: 'center', pointerEvents: 'none',
    });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => {
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(20px)';
  }, ms);
}

// ---------- Screen management ----------
export function show(id) { document.getElementById(id).classList.remove('hidden'); }
export function hide(id) { document.getElementById(id).classList.add('hidden'); }

// ---------- Settings modal wiring ----------
export function wireSettings(onChange) {
  const map = { 'set-sound': 'sound', 'set-smoke': 'smoke', 'set-skids': 'skids', 'set-shake': 'shake' };
  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    el.checked = settings[key];
    el.addEventListener('change', () => {
      settings[key] = el.checked;
      saveSettings();
      onChange(settings);
    });
  }
  const quality = document.getElementById('set-quality');
  quality.value = settings.quality;
  quality.addEventListener('change', () => {
    settings.quality = quality.value;
    saveSettings();
    onChange(settings);
  });
}

// ---------- Car color picker ----------
export function wireColorPicker(onColor) {
  const swatches = [...document.querySelectorAll('#color-picker .swatch')];
  const mark = (hex) => {
    swatches.forEach((s) => s.classList.toggle('selected', s.dataset.color.toLowerCase() === hex.toLowerCase()));
  };
  mark(settings.carColor);
  swatches.forEach((s) => {
    s.addEventListener('click', () => {
      const hex = s.dataset.color;
      settings.carColor = hex;
      saveSettings();
      mark(hex);
      onColor(hex);
    });
  });
}

// ---------- Rotate hint ----------
export function updateRotateHint(inGame) {
  const hint = document.getElementById('rotate-hint');
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 760;
  if (inGame && isPortrait() && smallScreen) hint.classList.remove('hidden');
  else hint.classList.add('hidden');
}
