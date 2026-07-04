// audio.js — lightweight procedural engine + tire-screech sound using the
// WebAudio API. No audio files needed (keeps the GitHub Pages upload simple).
// Must be started from a user gesture (browsers block autoplay).

export class EngineAudio {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.ctx = null;
  }

  start() {
    if (this.started || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // ---- Engine: sawtooth through a lowpass, pitch tracks speed ----
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 60;

    this.sub = this.ctx.createOscillator();
    this.sub.type = 'square';
    this.sub.frequency.value = 30;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.14;

    this.osc.connect(this.filter);
    this.sub.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    // ---- Tire screech: filtered noise, gated by drift ----
    const bufSize = 2 * this.ctx.sampleRate;
    const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = noiseBuf;
    this.noise.loop = true;

    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 1800;
    this.noiseFilter.Q.value = 1.2;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.screechGain);
    this.screechGain.connect(this.master);

    this.osc.start();
    this.sub.start();
    this.noise.start();
    this.started = true;

    // Fade master in.
    this.master.gain.linearRampToValueAtTime(0.9, this.ctx.currentTime + 0.4);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update(speed01, throttle, drift01) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Engine pitch: idle ~55Hz up to ~220Hz.
    const targetFreq = 55 + speed01 * 165 + throttle * 20;
    this.osc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.sub.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.08);
    this.filter.frequency.setTargetAtTime(500 + speed01 * 2200, now, 0.1);
    this.engineGain.gain.setTargetAtTime(0.1 + throttle * 0.08, now, 0.1);

    // Tire screech during drift.
    const screech = Math.max(0, drift01 - 0.15) * 0.4;
    this.screechGain.gain.setTargetAtTime(screech, now, 0.05);
    this.noiseFilter.frequency.setTargetAtTime(1500 + drift01 * 1200, now, 0.1);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(on ? 0.9 : 0.0, now, 0.1);
    }
  }

  mute(muted) {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : (this.enabled ? 0.9 : 0), this.ctx.currentTime, 0.1);
    }
  }
}
