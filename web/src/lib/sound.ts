/**
 * Site sound. Off until the visitor turns it on (browsers block audio before a click).
 *
 *  - Real F1 cars: recordings from the Goodwood Festival of Speed by Edvvc on
 *    Wikimedia Commons (CC BY-SA 3.0), played for the race start and camera pass-bys.
 *  - Onboard engine: a synthesised turbo V6 note that follows the followed car's
 *    revs, gear changes and throttle in the 3D scene.
 *  - Team radio: a squelch and pips before each radio message, like the broadcast.
 */
const KEY = "pitwall:sound";
const SAMPLES = ["ferrari-f60-2009", "red-bull-rb5-2009", "mclaren-mp4-23-2008", "williams-fw32-2010"];
const START = "f1-start-goodwood";

type Listener = (on: boolean) => void;

class SoundBoard {
  on = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, { buf: AudioBuffer; peak: number }>();
  private listeners = new Set<Listener>();
  private engine: { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; base: number } | null = null;
  private lastPass = 0;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      // Remember the visitor wanted sound, but still wait for a click to start audio.
      this.on = false;
      if (localStorage.getItem(KEY) === "on") this.wanted = true;
    } catch {
      /* storage unavailable */
    }
  }
  wanted = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  async toggle(force?: boolean) {
    const next = force ?? !this.on;
    this.on = next;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (next) {
      this.ensure();
      await this.ctx!.resume();
      this.master!.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.2);
      await this.load();
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    this.listeners.forEach((f) => f(next));
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  private async load() {
    const ctx = this.ctx!;
    await Promise.all(
      [START, ...SAMPLES].map(async (name) => {
        if (this.buffers.has(name)) return;
        try {
          const res = await fetch(`/audio/${name}.mp3`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, { buf, peak: loudest(buf) });
        } catch {
          /* missing sample: stay quiet */
        }
      }),
    );
  }

  /** A real car launching off the line: used for lights out. */
  launch() {
    const name = SAMPLES[(Math.random() * SAMPLES.length) | 0];
    this.play(name, { from: "start", gain: 0.9, duration: 9 });
  }

  /** A real car going past a trackside camera. */
  passBy(closeness: number) {
    const now = performance.now();
    if (now - this.lastPass < 2500) return;
    this.lastPass = now;
    const name = SAMPLES[(Math.random() * SAMPLES.length) | 0];
    this.play(name, { from: "peak", gain: 0.35 + closeness * 0.5, duration: 3.2, pan: Math.random() < 0.5 ? -0.6 : 0.6 });
  }

  ambience() {
    this.play(START, { from: "start", gain: 0.45, duration: 30 });
  }

  private play(name: string, o: { from: "start" | "peak"; gain: number; duration: number; pan?: number }) {
    if (!this.on || !this.ctx || !this.master) return;
    const s = this.buffers.get(name);
    if (!s) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const offset = o.from === "peak" ? Math.max(0, s.peak - o.duration * 0.45) : 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.08);
    g.gain.setValueAtTime(o.gain, t + o.duration - 0.6);
    g.gain.linearRampToValueAtTime(0, t + o.duration);
    let node: AudioNode = src.connect(g);
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan, t);
      p.pan.linearRampToValueAtTime(-o.pan, t + o.duration);
      node = node.connect(p);
    }
    node.connect(this.master);
    src.start(t, offset, o.duration);
  }

  /** Squelch and two pips, then the message is shown on screen. */
  radio() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.35);
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    noise.connect(bp).connect(ng).connect(this.master);
    noise.start(t);
    [0.36, 0.48].forEach((dt, k) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = k ? 1320 : 990;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.12, t + dt + 0.01);
      g.gain.linearRampToValueAtTime(0, t + dt + 0.09);
      o.connect(g).connect(this.master!);
      o.start(t + dt);
      o.stop(t + dt + 0.1);
    });
  }

  /** Onboard engine: call every frame with revs (0..1 within a gear) and throttle. */
  engineUpdate(active: boolean, rpm: number, throttle: number) {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (active && !this.engine) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 6;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 3.2);
      }
      shaper.curve = curve;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const mix = ctx.createGain();
      mix.gain.value = 0.35;
      const oscs = [
        { type: "sawtooth" as const, mul: 1, g: 0.6 },
        { type: "square" as const, mul: 0.5, g: 0.35 },
        { type: "sawtooth" as const, mul: 2, g: 0.18 },
        { type: "triangle" as const, mul: 3.01, g: 0.08 },
      ].map((o) => {
        const osc = ctx.createOscillator();
        osc.type = o.type;
        const g = ctx.createGain();
        g.gain.value = o.g;
        osc.connect(g).connect(mix);
        osc.start();
        (osc as OscillatorNode & { mul: number }).mul = o.mul;
        return osc;
      });
      mix.connect(shaper).connect(filter).connect(gain).connect(this.master);
      this.engine = { oscs, gain, filter, base: 0 };
    }
    if (!this.engine) return;
    const e = this.engine;
    const t = ctx.currentTime;
    if (!active) {
      e.gain.gain.setTargetAtTime(0, t, 0.15);
      const eng = e;
      this.engine = null;
      setTimeout(() => eng.oscs.forEach((o) => o.stop()), 800);
      return;
    }
    // 6 cylinders, four-stroke: 3 firing pulses per revolution. 6,000 to 12,500 rpm in each gear.
    const revs = 6000 + rpm * 6500;
    const f = (revs / 60) * 3 * 0.5;
    e.oscs.forEach((o) => o.frequency.setTargetAtTime(f * (o as OscillatorNode & { mul: number }).mul, t, 0.04));
    e.filter.frequency.setTargetAtTime(700 + throttle * 3800, t, 0.05);
    e.gain.gain.setTargetAtTime(0.1 + throttle * 0.28, t, 0.06);
  }
}

/** Time (s) of the loudest half-second in a recording. */
function loudest(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const win = Math.floor(buf.sampleRate * 0.5);
  let best = 0,
    at = 0;
  for (let i = 0; i + win < d.length; i += win / 2) {
    let s = 0;
    for (let j = i; j < i + win; j += 16) s += d[j] * d[j];
    if (s > best) {
      best = s;
      at = i;
    }
  }
  return at / buf.sampleRate;
}

export const sound = typeof window === "undefined" ? (null as unknown as SoundBoard) : new SoundBoard();
