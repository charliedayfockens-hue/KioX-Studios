// ui.js — menus, settings, fullscreen/orientation handling, the animated
// 3D car preview on the main menu, and screen transitions.

import * as THREE from 'three';
import { Car } from './car.js';

const LS_KEY = 'kiox-drift-settings';

export const settings = loadSettings();

function loadSettings() {
  const def = { sound: true, smoke: true, skids: true, shake: true, quality: 'medium' };
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { ...def, ...saved };
  } catch {
    return def;
  }
}

function saveSettings() {
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

    // Lights
    this.scene.add(new THREE.HemisphereLight(0x8090ff, 0x101018, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(5, 8, 4);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x00e5ff, 2.4, 30);
    rim.position.set(-6, 2, -4);
    this.scene.add(rim);
    const rim2 = new THREE.PointLight(0xff2d75, 2.0, 30);
    rim2.position.set(6, 1, -5);
    this.scene.add(rim2);

    // Reflective floor disc
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.35, metalness: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0x00e5ff, 0x1c2436);
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    this.scene.add(grid);

    // The car (mesh only; no physics here)
    this.car = new Car(this.scene);
    this.car.group.position.set(0, 0, 0);
    this.car.body.rotation.set(0, 0, 0);

    this.spin = 0;
    this.running = true;
    this._last = performance.now();
    this.resize();
    this._loop();
  }

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
    // Gentle idle bob + wheel idle spin.
    this.car.body.position.y = Math.sin(now * 0.002) * 0.03;
    for (const k of ['fl', 'fr', 'rl', 'rr']) this.car.wheels[k].rotation.x += dt * 0.4;

    this.renderer.render(this.scene, this.camera);
  };
}

// ---------- Fullscreen + orientation ----------
export async function goFullscreen() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) { /* Safari may reject; ignore */ }

  // Try to lock landscape (Android Chrome supports this; iOS does not).
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) { /* not supported — rely on the rotate hint */ }
}

export function isPortrait() {
  return window.matchMedia('(orientation: portrait)').matches;
}

// ---------- Screen management ----------
export function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
export function hide(id) {
  document.getElementById(id).classList.add('hidden');
}

// ---------- Settings modal wiring ----------
export function wireSettings(onChange) {
  const map = {
    'set-sound': 'sound',
    'set-smoke': 'smoke',
    'set-skids': 'skids',
    'set-shake': 'shake',
  };
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

// ---------- Rotate hint ----------
export function updateRotateHint(inGame) {
  const hint = document.getElementById('rotate-hint');
  // Only nag while playing on a portrait phone-sized screen.
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 760;
  if (inGame && isPortrait() && smallScreen) {
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}
