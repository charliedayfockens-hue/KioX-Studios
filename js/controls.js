// controls.js — unified touch + keyboard input for the drift car.
// Exposes a live `input` state object read every frame by the physics.

export const input = {
  gas: 0,        // 0..1
  brake: 0,      // 0..1 (also reverse)
  steer: 0,      // -1 (left) .. 1 (right)
  handbrake: false,
};

// Discrete button states, resolved into the analog `input` each frame.
const state = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  handbrake: false,
  // keyboard equivalents kept separate so touch + keys can coexist
  kLeft: false,
  kRight: false,
  kGas: false,
  kBrake: false,
  kHandbrake: false,
};

// Smoothed steering so taps don't snap the wheels instantly.
let steerTarget = 0;

export function resolveInput(dt) {
  const left = state.left || state.kLeft;
  const right = state.right || state.kRight;
  const gas = state.gas || state.kGas;
  const brake = state.brake || state.kBrake;
  const handbrake = state.handbrake || state.kHandbrake;

  steerTarget = (right ? 1 : 0) - (left ? 1 : 0);

  // Ease steering toward target — near-instant response for snappy mobile steering.
  const steerSpeed = 22;
  input.steer += (steerTarget - input.steer) * Math.min(1, steerSpeed * dt);
  if (Math.abs(input.steer) < 0.001) input.steer = 0;

  input.gas = gas ? 1 : 0;
  input.brake = brake ? 1 : 0;
  input.handbrake = handbrake;
}

// ---- Touch buttons ----
export function initTouchControls() {
  const buttons = document.querySelectorAll('.ctrl[data-key]');
  buttons.forEach((btn) => {
    const key = btn.dataset.key;
    const press = (e) => {
      e.preventDefault();
      setKey(key, true);
      btn.classList.add('pressed');
    };
    const release = (e) => {
      e.preventDefault();
      setKey(key, false);
      btn.classList.remove('pressed');
    };
    // Pointer events give us clean multi-touch handling across iOS/Android.
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    // Fallback for older touch stacks.
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
  });
}

function setKey(key, val) {
  switch (key) {
    case 'left': state.left = val; break;
    case 'right': state.right = val; break;
    case 'gas': state.gas = val; break;
    case 'brake': state.brake = val; break;
    case 'handbrake': state.handbrake = val; break;
  }
}

// ---- Keyboard (PC testing) ----
export function initKeyboardControls() {
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
}

function onKey(e, down) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': state.kGas = down; break;
    case 'KeyS': case 'ArrowDown': state.kBrake = down; break;
    case 'KeyA': case 'ArrowLeft': state.kLeft = down; break;
    case 'KeyD': case 'ArrowRight': state.kRight = down; break;
    case 'Space': state.kHandbrake = down; e.preventDefault(); break;
    default: return;
  }
}

// Release everything (used when pausing / leaving the game).
export function releaseAll() {
  for (const k of Object.keys(state)) state[k] = false;
  input.gas = input.brake = input.steer = 0;
  input.handbrake = false;
  document.querySelectorAll('.ctrl.pressed').forEach((b) => b.classList.remove('pressed'));
}
