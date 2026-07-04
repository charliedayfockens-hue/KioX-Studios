// main.js — entry point. Wires the menu, settings, color picker,
// fullscreen/orientation and starts the game. Loaded as an ES module.

import { Game } from './game.js';
import {
  settings, MenuPreview, goFullscreen, show, hide,
  wireSettings, wireColorPicker, wireSelectors, updateRotateHint,
} from './ui.js';
import { initTouchControls, initKeyboardControls } from './controls.js';

let game = null;
let preview = null;
let state = 'menu'; // 'menu' | 'game' | 'paused'

// Prevent iOS Safari pinch-zoom / double-tap zoom / rubber-band scroll.
function lockZoom() {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    // Allow scrolling inside the menu and modals; lock everything else
    // (so the game view never scrolls during gameplay).
    if (!e.target.closest('.menu-scroll') && !e.target.closest('.modal-card')) {
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.ctrl') || e.target.closest('.btn') || e.target.closest('.swatch')) e.preventDefault();
  });
}

// Small tap feedback for any button that lacks its own :active spring.
function tapFeedback(el) {
  el.addEventListener('pointerdown', () => el.classList.add('tapped'));
  const clear = () => el.classList.remove('tapped');
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('pointercancel', clear);
}

function init() {
  lockZoom();
  initTouchControls();
  initKeyboardControls();

  preview = new MenuPreview(document.getElementById('menu-canvas'));

  // ---- Menu buttons ----
  document.getElementById('btn-play').addEventListener('click', startGame);

  // Fullscreen buttons (menu + in-game) — always give feedback, then resize.
  ['btn-fullscreen-menu', 'btn-fullscreen-game'].forEach((id) => {
    const btn = document.getElementById(id);
    tapFeedback(btn);
    btn.addEventListener('click', async () => {
      btn.classList.add('busy');
      await goFullscreen();
      // Resize a few times as the viewport settles after FS/rotation.
      setTimeout(onResize, 60);
      setTimeout(onResize, 350);
      setTimeout(onResize, 700);
      btn.classList.remove('busy');
    });
  });

  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-settings').addEventListener('click', () => show('settings-modal'));
  document.getElementById('btn-settings-close').addEventListener('click', () => hide('settings-modal'));
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) hide('settings-modal'); });

  wireSettings((s) => { if (game) game.applySettings(s); });

  // Car color picker → update the live preview car AND the game car.
  wireColorPicker((hex) => {
    if (preview) preview.setCarColor(hex);
    if (game) game.setCarColor(hex);
  });

  // Map + mode segmented selectors.
  wireSelectors();

  // ---- Pause menu ----
  document.getElementById('btn-pause').addEventListener('click', pauseGame);
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-restart').addEventListener('click', () => { game.resetCar(); resumeGame(); });
  document.getElementById('btn-quit').addEventListener('click', quitToMenu);

  // ---- Race finish overlay ----
  document.getElementById('btn-race-restart').addEventListener('click', () => {
    hide('race-finish');
    game.restartRace();
    state = 'game';
  });
  document.getElementById('btn-race-menu').addEventListener('click', quitToMenu);

  // ---- Resize / orientation / fullscreen ----
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
  document.addEventListener('fullscreenchange', () => setTimeout(onResize, 100));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(onResize, 100));
  if (screen.orientation) {
    screen.orientation.addEventListener?.('change', () => setTimeout(onResize, 250));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'game') pauseGame();
  });

  onResize();
}

function startGame() {
  if (!game) game = new Game(document.getElementById('game-canvas'), settings);

  hide('menu');
  hide('race-finish');
  hide('pause-overlay');
  if (preview) preview.setRunning(false);
  show('game');
  state = 'game';

  requestAnimationFrame(() => {
    game.start({ mode: settings.mode, track: settings.map });
    game.setCarColor(settings.carColor);
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
  if (game && game.scene) game.resize();
  if (preview) preview.resize();
  updateRotateHint(state === 'game' || state === 'paused');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
