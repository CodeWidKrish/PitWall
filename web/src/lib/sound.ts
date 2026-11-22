/**
 * Site sound. Off until the visitor turns it on (browsers block audio before a click).
 *
 *  Engine: built from real F1 recordings (Goodwood Festival of Speed, by Edvvc on
 *  Wikimedia Commons, CC BY-SA 3.0). A steady high-rev slice of each recording is
 *  replayed as many short overlapping grains, pitched up and down with the followed
 *  car's revs: the same idea racing games use. Onboard it is close and loud; on the
 *  broadcast cameras it is distant, with full recorded pass-bys past the trackside cams.
 *
 *  Lights out: a real car pulling away from the start line.
 *
 *  Team radio: a spoken message (the browser's speech voice) inside a band-limited
 *  radio static bed, with the squelch and pips either side.
 */
const KEY = "pitwall:sound";
const PASS = ["ferrari-f60-2009", "red-bull-rb5-2009", "mclaren-mp4-23-2008", "williams-fw32-2010"];
const START = "f1-start-goodwood";
// Steady high-rev slices found by pitch analysis: [file, start s, length s].
const GRAIN_SOURCES: [string, number, number][] = [
  ["ferrari-f60-2009", 6.0, 0.5],
  ["red-bull-rb5-2009", 13.88, 0.5],
];

type Listener = (on: boolean) => void;
type View = "off" | "near" | "far";

function hann(n: number) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return a;
}

class SoundBoard {
  on = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private listeners = new Set<Listener>();
  private lastPass = 0;

  // engine
  private engineBus: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextGrain = 0;
  private rate = 0.8;
  private throttle = 0;
  private view: View = "off";
  private window = hann(64);

  // radio
  private speaking = false;

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
      await this.load();
      this.master!.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.25);
      this.startEngine();
    } else {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.stopEngine();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
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
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  private async load() {
    const ctx = this.ctx!;
    await Promise.all(
      [START, ...PASS].map(async (name) => {
        if (this.buffers.has(name)) return;
        try {
          const res = await fetch(`/audio/${name}.mp3`);
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* missing sample: stay quiet */
        }
      }),
    );
  }

  /* ------------------------------------------------------------- engine */

  /** Which mix the hero wants: close onboard, distant broadcast, or silent. */
  setView(view: View) {
    this.view = view;
    if (!this.ctx || !this.engineBus || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    const gain = view === "near" ? 0.55 : view === "far" ? 0.12 : 0;
    this.engineBus.gain.setTargetAtTime(gain, t, 0.35);
    this.engineFilter.frequency.setTargetAtTime(view === "near" ? 9000 : 1400, t, 0.3);
  }

  /** Revs within the gear (0..1) and throttle (0..1) from the 3D scene, ~20 times a second. */
  engine(rpm: number, throttle: number) {
    // 0.72 just after an upshift to 1.1 at the limiter, relative to the recorded slice.
    this.rate = 0.72 + Math.min(1, Math.max(0, rpm)) * 0.38;
    this.throttle = throttle;
  }

  private startEngine() {
    if (this.timer || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.Q.value = 0.7;
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0;
    this.engineBus.connect(this.engineFilter).connect(this.master);
    this.nextGrain = ctx.currentTime + 0.05;
    this.setView(this.view);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private stopEngine() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.engineBus?.disconnect();
    this.engineBus = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.engineBus || this.view === "off") {
      if (ctx) this.nextGrain = ctx.currentTime + 0.05;
      return;
    }
    const grainLen = 0.09;
    const step = 0.03; // three grains overlap at any moment
    while (this.nextGrain < ctx.currentTime + 0.12) {
      GRAIN_SOURCES.forEach(([name, start, len], layer) => {
        const buf = this.buffers.get(name);
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        // layer 2 sits an octave down for body
        const rate = this.rate * (layer === 0 ? 1 : 0.5) * (1 + (Math.random() - 0.5) * 0.006);
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        const peak = (layer === 0 ? 0.42 : 0.22) * (0.35 + this.throttle * 0.65);
        g.gain.value = 0;
        g.gain.setValueCurveAtTime(
          this.window.map((w) => w * peak),
          this.nextGrain,
          grainLen,
        );
        src.connect(g).connect(this.engineBus!);
        const offset = start + Math.random() * Math.max(0, len - grainLen * rate);
        src.start(this.nextGrain, offset, grainLen * rate + 0.01);
      });
      this.nextGrain += step;
    }
  }

  /* ---------------------------------------------------- recorded moments */

  /** A real car launching off the line: used for lights out. */
  launch() {
    const name = PASS[(Math.random() * PASS.length) | 0];
    this.play(name, { from: 0, gain: 0.8, duration: 8 });
  }

  /** A real car going past a trackside camera. */
  passBy(closeness: number) {
    if (this.view !== "far") return;
    const now = performance.now();
    if (now - this.lastPass < 3000) return;
    this.lastPass = now;
    const pick = GRAIN_SOURCES[(Math.random() * GRAIN_SOURCES.length) | 0];
    this.play(pick[0], { from: Math.max(0, pick[1] - 1.2), gain: 0.3 + closeness * 0.35, duration: 2.6, pan: Math.random() < 0.5 ? -0.7 : 0.7 });
  }

  ambience() {
    this.play(START, { from: 0, gain: 0.35, duration: 14 });
  }

  private play(name: string, o: { from: number; gain: number; duration: number; pan?: number }) {
    if (!this.on || !this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.12);
    g.gain.setValueAtTime(o.gain, t + o.duration - 0.8);
    g.gain.linearRampToValueAtTime(0, t + o.duration);
    let node: AudioNode = src.connect(g);
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan, t);
      p.pan.linearRampToValueAtTime(-o.pan, t + o.duration);
      node = node.connect(p);
    }
    node.connect(this.master);
    src.start(t, o.from, o.duration);
  }

  /* ---------------------------------------------------------- team radio */

  private squelch(at: number, gain = 0.2) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.28);
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master!);
    src.start(at);
  }

  private pips(at: number) {
    const ctx = this.ctx!;
    [0, 0.12].forEach((dt, k) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = k ? 1320 : 990;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at + dt);
      g.gain.linearRampToValueAtTime(0.14, at + dt + 0.01);
      g.gain.linearRampToValueAtTime(0, at + dt + 0.09);
      o.connect(g).connect(this.master!);
      o.start(at + dt);
      o.stop(at + dt + 0.1);
    });
  }

  /** Static bed under the voice, returned so it can be stopped when the voice ends. */
  private staticBed() {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.045, ctx.currentTime, 0.05);
    src.connect(hp).connect(lp).connect(g).connect(this.master!);
    src.start();
    return () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => src.stop(), 300);
    };
  }

  private voice(): SpeechSynthesisVoice | null {
    if (typeof speechSynthesis === "undefined") return null;
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const rank = (v: SpeechSynthesisVoice) =>
      (/natural|online/i.test(v.name) ? 4 : 0) +
      (v.lang === "en-GB" ? 3 : 0) +
      (/ryan|thomas|george|daniel|male|guy|brian|google uk english male/i.test(v.name) ? 2 : 0) +
      (v.localService ? 0 : 1);
    return vs.sort((a, b) => rank(b) - rank(a))[0] ?? null;
  }

  /** Team radio: squelch, pips, the message spoken over static, squelch. */
  radio(text: string) {
    if (!this.on || !this.ctx || !this.master || this.speaking) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.squelch(t);
    this.pips(t + 0.25);
    const duck = this.engineBus;
    duck?.gain.setTargetAtTime(this.view === "near" ? 0.2 : 0.05, t, 0.2);
    const restore = () => this.setView(this.view);
    if (typeof speechSynthesis === "undefined") {
      setTimeout(restore, 1500);
      return;
    }
    this.speaking = true;
    setTimeout(() => {
      const stopStatic = this.staticBed();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voice();
      if (v) u.voice = v;
      u.rate = 1.08;
      u.pitch = 0.9;
      u.volume = 1;
      const end = () => {
        stopStatic();
        if (this.ctx) this.squelch(this.ctx.currentTime + 0.05, 0.16);
        this.speaking = false;
        restore();
      };
      u.onend = end;
      u.onerror = end;
      speechSynthesis.speak(u);
    }, 520);
  }
}

export const sound = typeof window === "undefined" ? (null as unknown as SoundBoard) : new SoundBoard();
