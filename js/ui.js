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
    this.scene.background = new THREE.Color(0x0e1626);
    this.scene.fog = new THREE.Fog(0x0e1626, 16, 42);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(6, 3.4, 7.5);
    this.camera.lookAt(0, 0.8, 0);

    // Calm, soft lighting — one key + one gentle cyan rim (no clashing colors).
    this.scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x161c2a, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(5, 9, 5);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x38d6ff, 1.4, 30); rim.position.set(-6, 2.5, -4); this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x121a2b, roughness: 0.5, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x2a3a58, 0x1a2438);
    grid.material.opacity = 0.16; grid.material.transparent = true;
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
// Orientation is judged purely by the viewport dimensions (reliable across
// iOS/Android), NOT by fullscreen/orientation-lock support.
export function isLandscape() { return window.innerWidth >= window.innerHeight; }
export function isPortrait() { return !isLandscape(); }
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// Tries fullscreen, then orientation lock, then ALWAYS continues. Never blocks
// gameplay and never claims "unsupported" when the phone is already sideways.
export async function goFullscreen() {
  const target = document.getElementById('game') || document.documentElement;
  const reqFs =
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.webkitRequestFullScreen ||
    target.msRequestFullscreen;
  const inFs = isFullscreen();

  let fsOk = false;
  try {
    if (inFs) {
      fsOk = true;
    } else if (reqFs) {
      const p = reqFs.call(target, { navigationUI: 'hide' });
      if (p && p.then) await p;
      fsOk = true;
    }
  } catch (e) {
    fsOk = false; // e.g. iOS Safari rejects fullscreen on non-video elements
  }

  // Best-effort orientation lock (Android Chrome). Failure is fine.
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) { /* not supported — no problem, we keep playing */ }

  // Messaging is based on ACTUAL orientation, and is always non-blocking.
  if (isPortrait()) {
    toast('Rotate your phone sideways for best gameplay 📱');
  } else if (reqFs && !fsOk) {
    toast('Fullscreen may not be supported on this browser.');
  } else if (fsOk) {
    toast('Fullscreen on ✔');
  } else {
    // Already sideways, no fullscreen API — that's totally fine.
    toast('Playing in landscape ✔');
  }
  return { fullscreen: fsOk };
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

// ---------- Car color picker (presets + full custom color) ----------
export function wireColorPicker(onColor) {
  const swatches = [...document.querySelectorAll('#color-picker .swatch')];
  const custom = document.getElementById('custom-color');

  const mark = (hex) => {
    swatches.forEach((s) => s.classList.toggle('selected', s.dataset.color.toLowerCase() === hex.toLowerCase()));
  };

  const apply = (hex) => {
    settings.carColor = hex;
    saveSettings();
    mark(hex);
    if (custom) custom.value = normalizeHex(hex);
    onColor(hex);
  };

  // Init from saved setting.
  mark(settings.carColor);
  if (custom) custom.value = normalizeHex(settings.carColor);

  swatches.forEach((s) => s.addEventListener('click', () => apply(s.dataset.color)));

  // Full custom color — updates live as the user drags.
  if (custom) {
    custom.addEventListener('input', () => apply(custom.value));
    custom.addEventListener('change', () => apply(custom.value));
  }
}

// <input type=color> only accepts #rrggbb; coerce shorthand/uppercase safely.
function normalizeHex(hex) {
  let h = String(hex).trim();
  if (h[0] !== '#') h = '#' + h;
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : '#ff3b3b';
}

// ---------- Rotate hint ----------
export function updateRotateHint(inGame) {
  const hint = document.getElementById('rotate-hint');
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 760;
  if (inGame && isPortrait() && smallScreen) hint.classList.remove('hidden');
  else hint.classList.add('hidden');
}
