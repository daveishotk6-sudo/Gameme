import {
  GRASS, DIRT, STONE, LOG, LEAVES, SAND, COBBLE, WATER, PLANKS, GLASS, BRICK, SNOW, COAL_ORE, IRON_ORE,
  GOLD_ORE, BASALT, LANTERN, WOOL, CACTUS, FLOWER_RED, FLOWER_YELLOW, TALL_GRASS, GOLD_BLOCK, PINE_LEAVES, SIGN,
} from "./blocks";

/**
 * Sound effects, synthesised with Web Audio so there are no audio files to download.
 * Browsers (especially iPad Safari) only allow audio after a touch/click/key, so the engine calls
 * `sfx.unlock()` from those events; until then every call is a silent no-op.
 */

export type Mat = "stone" | "dirt" | "grass" | "sand" | "wood" | "leaf" | "wool" | "snow" | "glass" | "metal" | "water";

export function materialOf(id: number): Mat {
  switch (id) {
    case STONE: case COBBLE: case BRICK: case BASALT: case COAL_ORE: case IRON_ORE: case GOLD_ORE: return "stone";
    case DIRT: return "dirt";
    case GRASS: case TALL_GRASS: case FLOWER_RED: case FLOWER_YELLOW: return "grass";
    case SAND: return "sand";
    case LOG: case PLANKS: case CACTUS: case SIGN: return "wood";
    case LEAVES: case PINE_LEAVES: return "leaf";
    case WOOL: return "wool";
    case SNOW: return "snow";
    case GLASS: case LANTERN: return "glass";
    case GOLD_BLOCK: return "metal";
    case WATER: return "water";
    default: return "stone";
  }
}

interface NoiseSpec { type: BiquadFilterType; f: number; q: number; dur: number; g: number; body?: number }

/** Base "hit" sound per material: filtered noise plus an optional low thump. */
const HIT: Record<Exclude<Mat, "glass" | "water">, NoiseSpec> = {
  stone: { type: "bandpass", f: 1900, q: 0.9, dur: 0.12, g: 0.55, body: 150 },
  metal: { type: "bandpass", f: 2400, q: 1.2, dur: 0.12, g: 0.45, body: 170 },
  dirt: { type: "lowpass", f: 800, q: 0.7, dur: 0.12, g: 0.7, body: 95 },
  grass: { type: "bandpass", f: 2600, q: 0.5, dur: 0.13, g: 0.4 },
  sand: { type: "bandpass", f: 3400, q: 0.4, dur: 0.14, g: 0.4 },
  wood: { type: "bandpass", f: 950, q: 2.2, dur: 0.11, g: 0.7, body: 230 },
  leaf: { type: "highpass", f: 4200, q: 0.3, dur: 0.15, g: 0.28 },
  wool: { type: "lowpass", f: 600, q: 0.5, dur: 0.12, g: 0.45 },
  snow: { type: "lowpass", f: 2000, q: 0.4, dur: 0.15, g: 0.4 },
};

/** Footstep sound per surface: low-pass cutoff (Hz), length (s), loudness, optional low thump (Hz). */
const STEP: Record<Exclude<Mat, "water">, { f: number; dur: number; g: number; body?: number }> = {
  stone: { f: 900, dur: 0.09, g: 0.28, body: 110 },
  metal: { f: 1000, dur: 0.09, g: 0.26, body: 120 },
  glass: { f: 1100, dur: 0.07, g: 0.14 },
  dirt: { f: 520, dur: 0.1, g: 0.32, body: 80 },
  grass: { f: 1000, dur: 0.1, g: 0.2 },
  sand: { f: 1200, dur: 0.11, g: 0.18 },
  wood: { f: 700, dur: 0.09, g: 0.28, body: 140 },
  leaf: { f: 1300, dur: 0.1, g: 0.13 },
  wool: { f: 400, dur: 0.09, g: 0.2 },
  snow: { f: 850, dur: 0.11, g: 0.18 },
};

const STORE_KEY = "gameme:sound";

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: AudioNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORE_KEY) === "off";
    } catch {
      /* storage unavailable: default to sound on */
    }
  }

  /** Call from a user gesture (touch, click or key). Safe to call repeatedly. */
  unlock() {
    try {
      // Let sound play on iPad/iPhone even when the silent switch is on (Safari 16.4+).
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC({ latencyHint: "interactive" });
        const comp = ctx.createDynamicsCompressor();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.6;
        comp.connect(master);
        master.connect(ctx.destination);
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.master = master;
        this.noiseBuf = buf;
        this.bus = comp;
      }
      if (this.ctx.state !== "running") void this.ctx.resume();
    } catch {
      /* no audio available: stay silent */
    }
  }
  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(STORE_KEY, m ? "off" : "on");
    } catch {
      /* ignore */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------ helpers

  private ready(): AudioContext | null {
    const c = this.ctx;
    return c && c.state === "running" && !this.muted && this.bus && this.noiseBuf ? c : null;
  }

  /** Drop a sound if the same kind played less than `ms` ago (keeps bursts from piling up). */
  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -1e9) < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private noise(c: AudioContext, t: number, o: { type: BiquadFilterType; f: number; f2?: number; q: number; dur: number; g: number; rate?: number; attack?: number }) {
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q;
    const e = c.createGain();
    const g = Math.max(0.0002, o.g);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + (o.attack ?? 0.004));
    e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(e);
    e.connect(this.bus!);
    src.start(t, Math.random() * 0.9, o.dur + 0.03);
  }

  private tone(c: AudioContext, t: number, o: { type: OscillatorType; f: number; f2?: number; dur: number; g: number; delay?: number }) {
    const t0 = t + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    const e = c.createGain();
    const g = Math.max(0.0002, o.g);
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(e);
    e.connect(this.bus!);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  private glass(c: AudioContext, t: number, vol: number, pieces: number) {
    for (let i = 0; i < pieces; i++) {
      this.tone(c, t, {
        type: "triangle", f: 2200 + Math.random() * 2800, dur: 0.1 + Math.random() * 0.12,
        g: 0.13 * vol, delay: i * 0.012 + Math.random() * 0.02,
      });
    }
    this.noise(c, t, { type: "highpass", f: 5000, q: 0.4, dur: 0.1, g: 0.2 * vol });
  }

  // ------------------------------------------------------------ block sounds

  /** Mining tap ("hit"), block removed ("break") or block put down ("place"). `vol` fades with distance. */
  block(id: number, kind: "hit" | "break" | "place", vol = 1) {
    const c = this.ready();
    if (!c || vol <= 0.01) return;
    if (!this.gate("block-" + kind, kind === "hit" ? 90 : 45)) return;
    const mat = materialOf(id);
    if (mat === "water") return;
    const t = c.currentTime;
    const k = (kind === "break" ? 1 : kind === "place" ? 0.8 : 0.55) * vol;
    if (mat === "glass") {
      this.glass(c, t, k, kind === "break" ? 5 : 2);
      return;
    }
    const p = HIT[mat];
    const rate = (kind === "place" ? 0.85 : 1) * (0.92 + Math.random() * 0.16);
    const dur = p.dur * (kind === "break" ? 1.5 : 1);
    this.noise(c, t, { type: p.type, f: p.f * (0.9 + Math.random() * 0.2), q: p.q, dur, g: p.g * k, rate });
    if (p.body) this.tone(c, t, { type: "sine", f: p.body * (kind === "place" ? 1.25 : 1), f2: p.body * 0.5, dur: dur * 0.9, g: 0.45 * p.g * k });
    if (mat === "metal") {
      this.tone(c, t, { type: "triangle", f: 1180, dur: 0.35, g: 0.1 * k });
      this.tone(c, t, { type: "triangle", f: 1770, dur: 0.25, g: 0.06 * k, delay: 0.01 });
    }
  }

  /** Footsteps: low-passed, slow-attack thuds so they sound muffled rather than sharp. */
  step(mat: Mat, running = false) {
    const c = this.ready();
    if (!c || !this.gate("step", 110)) return;
    const t = c.currentTime;
    if (mat === "water") return this.swim();
    const p = STEP[mat];
    const k = running ? 1.15 : 1;
    const vary = 0.88 + Math.random() * 0.24;
    this.noise(c, t, { type: "lowpass", f: p.f * vary, q: 0.3, dur: p.dur, g: p.g * k, rate: 0.7 + Math.random() * 0.2, attack: 0.014 });
    if (p.body) this.tone(c, t, { type: "sine", f: p.body * vary, f2: p.body * 0.6, dur: 0.09, g: 0.1 * k });
  }

  // ------------------------------------------------------------ body sounds

  jump() {
    const c = this.ready();
    if (!c || !this.gate("jump", 120)) return;
    this.noise(c, c.currentTime, { type: "bandpass", f: 700, f2: 1500, q: 0.8, dur: 0.1, g: 0.12 });
  }

  land(fall: number, mat: Mat) {
    const c = this.ready();
    if (!c || !this.gate("land", 120)) return;
    const t = c.currentTime;
    const k = Math.min(1, 0.3 + fall / 7);
    if (mat === "water") return this.splash(k);
    const p = HIT[mat === "glass" ? "stone" : mat];
    this.noise(c, t, { type: p.type, f: p.f * 0.8, q: p.q, dur: 0.1 + 0.08 * k, g: p.g * 0.8 * k });
    this.tone(c, t, { type: "sine", f: 130, f2: 45, dur: 0.18, g: 0.35 * k });
  }

  hurt() {
    const c = this.ready();
    if (!c || !this.gate("hurt", 150)) return;
    const t = c.currentTime;
    this.tone(c, t, { type: "sawtooth", f: 280, f2: 110, dur: 0.22, g: 0.2 });
    this.tone(c, t, { type: "square", f: 190, f2: 80, dur: 0.18, g: 0.08 });
    this.noise(c, t, { type: "lowpass", f: 900, q: 0.6, dur: 0.14, g: 0.22 });
  }

  death() {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    this.tone(c, t, { type: "sawtooth", f: 330, f2: 60, dur: 0.9, g: 0.2 });
    this.tone(c, t, { type: "sine", f: 165, f2: 40, dur: 1.1, g: 0.3, delay: 0.05 });
    this.noise(c, t, { type: "lowpass", f: 1200, f2: 200, q: 0.5, dur: 0.6, g: 0.25 });
  }

  respawn() {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    this.tone(c, t, { type: "sine", f: 523, dur: 0.22, g: 0.14 });
    this.tone(c, t, { type: "sine", f: 784, dur: 0.3, g: 0.14, delay: 0.11 });
  }

  // ------------------------------------------------------------ water

  splash(power = 0.6) {
    const c = this.ready();
    if (!c || !this.gate("splash", 150)) return;
    const t = c.currentTime;
    const p = Math.max(0.2, Math.min(1, power));
    this.noise(c, t, { type: "lowpass", f: 2200, f2: 350, q: 0.6, dur: 0.3 + 0.25 * p, g: 0.15 + 0.35 * p });
    this.noise(c, t, { type: "bandpass", f: 1200, f2: 600, q: 1.5, dur: 0.2, g: 0.12 * p, rate: 1.3 });
  }

  swim() {
    const c = this.ready();
    if (!c || !this.gate("swim", 250)) return;
    this.noise(c, c.currentTime, { type: "lowpass", f: 1000, f2: 400, q: 0.5, dur: 0.22, g: 0.12 });
  }

  bubble() {
    const c = this.ready();
    if (!c || !this.gate("bubble", 120)) return;
    const t = c.currentTime;
    this.tone(c, t, { type: "sine", f: 420, f2: 900, dur: 0.09, g: 0.12 });
    this.tone(c, t, { type: "sine", f: 520, f2: 1100, dur: 0.07, g: 0.08, delay: 0.07 });
  }

  // ------------------------------------------------------------ misc

  click() {
    const c = this.ready();
    if (!c || !this.gate("click", 40)) return;
    this.tone(c, c.currentTime, { type: "triangle", f: 900, f2: 650, dur: 0.045, g: 0.08 });
  }
}

export const sfx = new Sfx();
