// main.js — entry point. Wires the menu, settings, fullscreen/orientation and
// starts the game. Loaded as an ES module (see index.html import map).

import { Game } from './game.js';
import {
  settings, MenuPreview, goFullscreen, show, hide,
  wireSettings, updateRotateHint,
} from './ui.js';
import { initTouchControls, initKeyboardControls } from './controls.js';

let game = null;
let preview = null;
let state = 'menu'; // 'menu' | 'game' | 'paused'

// Prevent iOS Safari pinch-zoom / double-tap zoom.
function lockZoom() {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  // Block context menu long-press on controls.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.ctrl') || e.target.closest('.btn')) e.preventDefault();
  });
}

function init() {
  lockZoom();
  initTouchControls();
  initKeyboardControls();

  // Menu 3D preview
  preview = new MenuPreview(document.getElementById('menu-canvas'));

  // ---- Menu buttons ----
  document.getElementById('btn-play').addEventListener('click', startGame);
  document.getElementById('btn-fullscreen-menu').addEventListener('click', goFullscreen);
  document.getElementById('btn-fullscreen-game').addEventListener('click', goFullscreen);

  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-settings').addEventListener('click', () => show('settings-modal'));
  document.getElementById('btn-settings-close').addEventListener('click', () => hide('settings-modal'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) hide('settings-modal');
  });

  wireSettings((s) => { if (game) game.applySettings(s); });

  // ---- Pause menu ----
  document.getElementById('btn-pause').addEventListener('click', pauseGame);
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-restart').addEventListener('click', () => {
    game.resetCar();
    resumeGame();
  });
  document.getElementById('btn-quit').addEventListener('click', quitToMenu);

  // ---- Resize / orientation ----
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (screen.orientation) {
    screen.orientation.addEventListener?.('change', () => setTimeout(onResize, 250));
  }

  // Pause automatically when tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'game') pauseGame();
  });

  onResize();
}

function startGame() {
  if (!game) game = new Game(document.getElementById('game-canvas'), settings);
  game.applySettings(settings);

  hide('menu');
  if (preview) preview.setRunning(false);
  show('game');
  state = 'game';

  // Give the DOM a frame so canvas sizes to the game screen, then build/start.
  requestAnimationFrame(() => {
    game.start();
    game.resize();
    updateRotateHint(true);
  });
}

function pauseGame() {
  if (state !== 'game') return;
  game.pause();
  show('pause-overlay');
  state = 'paused';
}

function resumeGame() {
  if (!game) return;
  hide('pause-overlay');
  game.resume();
  state = 'game';
}

function quitToMenu() {
  hide('pause-overlay');
  hide('game');
  if (game) game.stop();
  show('menu');
  if (preview) preview.setRunning(true);
  state = 'menu';
  updateRotateHint(false);
}

function onResize() {
  if (game && game.built) game.resize();
  if (preview) preview.resize();
  updateRotateHint(state === 'game' || state === 'paused');
}

// Kick off once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
