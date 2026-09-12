// Music + sfx via Web Audio. Tracks loop gaplessly (AudioBufferSourceNode.loop). The context can only
// start after a user gesture, so play() requests are queued until the first key/click.
export const Audio = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  buffers: {}, current: null, currentName: null, wanted: null, unlocked: false, volume: 0.5,

  init() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.volume; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
      if (this.wanted) this.play(this.wanted);
    };
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("mousedown", unlock, { once: true });
  },

  async buffer(path) {
    if (this.buffers[path]) return this.buffers[path];
    const r = await fetch(path);
    if (!r.ok) throw new Error("music fetch failed " + r.status + " " + path);
    const ab = await r.arrayBuffer();
    let buf;
    try { buf = await this.ctx.decodeAudioData(ab); }
    catch (e) { console.error("audio decode failed for " + path + " (" + ab.byteLength + " bytes): " + (e && e.message)); throw e; }
    this.buffers[path] = buf;
    return buf;
  },

  // Switch music to `path` (null = silence). Soft crossfade.
  async play(path) {
    this.wanted = path;
    if (!this.ctx) return;
    if (this.currentName === path) return;
    const prev = this.current; const prevGain = this.currentGain;
    this.current = null; this.currentName = path;
    if (prev) {
      prevGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => { try { prev.stop(); } catch (e) { /* already stopped */ } }, 1500);
    }
    if (!path) return;
    const buf = await this.buffer(path);
    if (this.wanted !== path) return; // superseded while loading
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.musicGain);
    src.connect(g); src.start();
    g.gain.setTargetAtTime(1, this.ctx.currentTime, 0.6);
    this.current = src; this.currentGain = g;
  },

  setVolume(v) { this.volume = v; if (this.musicGain) this.musicGain.gain.value = v; },

  // Tiny synthesized sound effects (no SFX assets in the resource pile yet).
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const beep = (freq, dur, type, vol, slide) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol, lp) => {
      const n = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = this.ctx.createBufferSource(); s.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 1200;
      const g = this.ctx.createGain(); g.gain.value = vol || 0.15;
      s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
    };
    switch (name) {
      case "hoe": noise(0.12, 0.2, 900); beep(120, 0.1, "triangle", 0.1, 0.5); break;
      case "water": noise(0.25, 0.08, 3000); beep(600, 0.15, "sine", 0.04, 1.4); break;
      case "plant": beep(500, 0.08, "sine", 0.06, 1.5); break;
      case "harvest": beep(660, 0.08, "square", 0.05); beep(880, 0.1, "square", 0.05); break;
      case "hit": noise(0.08, 0.2, 2000); beep(200, 0.06, "square", 0.06, 0.6); break;
      case "break": noise(0.2, 0.25, 1500); beep(150, 0.15, "square", 0.08, 0.4); break;
      case "pickup": beep(900, 0.06, "sine", 0.05, 1.3); break;
      case "coin": beep(1200, 0.07, "square", 0.05); beep(1600, 0.1, "square", 0.05); break;
      case "ui": beep(700, 0.04, "square", 0.03); break;
      case "door": noise(0.15, 0.12, 600); break;
      case "sleep": beep(400, 0.3, "sine", 0.05, 0.5); break;
      default: break;
    }
  },
};
