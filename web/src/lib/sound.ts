/**
 * Site sound. Off until the visitor turns it on (browsers block audio before a click).
 *
 * Everything you hear from the cars is a real recording, played as recorded
 * (only trimmed, joined with crossfades and levelled), all from Wikimedia Commons:
 *
 *  - Trackside (broadcast and orbit cameras): 2021 Turkish GP, real V6 hybrid cars
 *    at Istanbul Park, filmed by SAİT71 (CC BY-SA 4.0).
 *  - Onboard: close-up launches of F1 cars at the Goodwood Festival of Speed,
 *    recorded by Edvvc (CC BY-SA 3.0).
 *  - Lights out: the grid pulling away at the 2021 Russian GP, filmed by rubin16
 *    (CC BY-SA 4.0).
 *
 * Team radio: the browser's speech voice over radio static, with squelch and pips.
 */
const KEY = "pitwall:sound";
const TRACKSIDE = "trackside-istanbul-2021";
const ONBOARD = "close-launches-goodwood";
const GRID = "grid-start-sochi-2021";

type Listener = (on: boolean) => void;
type View = "off" | "near" | "far";

interface Bed {
  gain: GainNode;
  src: AudioBufferSourceNode;
}

class SoundBoard {
  on = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private listeners = new Set<Listener>();
  private beds = new Map<string, Bed>();
  private view: View = "off";
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
      this.master!.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.3);
      this.startBeds();
      this.mix();
    } else {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
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
    this.master.connect(this.ctx.destination);
  }

  private async load() {
    const ctx = this.ctx!;
    await Promise.all(
      [TRACKSIDE, ONBOARD, GRID].map(async (name) => {
        if (this.buffers.has(name)) return;
        try {
          const res = await fetch(`/audio/${name}.mp3`);
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* missing recording: stay quiet */
        }
      }),
    );
  }

  /** Both beds loop silently from the start; the camera decides which one you hear. */
  private startBeds() {
    const ctx = this.ctx!;
    [TRACKSIDE, ONBOARD].forEach((name) => {
      if (this.beds.has(name)) return;
      const buf = this.buffers.get(name);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master!);
      src.start(0, Math.random() * buf.duration * 0.5);
      this.beds.set(name, { src, gain });
    });
  }

  /** Close onboard, distant trackside, or silent when the race is off screen. */
  setView(view: View) {
    this.view = view;
    this.mix();
  }

  private mix(duck = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const track = this.beds.get(TRACKSIDE);
    const board = this.beds.get(ONBOARD);
    track?.gain.gain.setTargetAtTime((this.view === "far" ? 0.75 : 0) * duck, t, 0.6);
    board?.gain.gain.setTargetAtTime((this.view === "near" ? 0.85 : 0) * duck, t, 0.6);
  }

  /** Lights out: the real grid pulling away. */
  launch() {
    if (!this.on || !this.ctx || !this.master) return;
    const buf = this.buffers.get(GRID);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.master);
    src.start();
  }

  /* ---------------------------------------------------------- team radio */

  private squelch(at: number, gain = 0.18) {
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
      g.gain.linearRampToValueAtTime(0.12, at + dt + 0.01);
      g.gain.linearRampToValueAtTime(0, at + dt + 0.09);
      o.connect(g).connect(this.master!);
      o.start(at + dt);
      o.stop(at + dt + 0.1);
    });
  }

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
    g.gain.setTargetAtTime(0.035, ctx.currentTime, 0.05);
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

  /** Team radio: squelch, pips, the message spoken over static, squelch. Engines dip underneath. */
  radio(text: string) {
    if (!this.on || !this.ctx || !this.master || this.speaking) return;
    const t = this.ctx.currentTime;
    this.squelch(t);
    this.pips(t + 0.25);
    this.mix(0.35);
    if (typeof speechSynthesis === "undefined") {
      setTimeout(() => this.mix(), 1500);
      return;
    }
    this.speaking = true;
    setTimeout(() => {
      const stopStatic = this.staticBed();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voice();
      if (v) u.voice = v;
      u.rate = 1.05;
      u.pitch = 0.95;
      const end = () => {
        stopStatic();
        if (this.ctx) this.squelch(this.ctx.currentTime + 0.05, 0.14);
        this.speaking = false;
        this.mix();
      };
      u.onend = end;
      u.onerror = end;
      speechSynthesis.speak(u);
    }, 520);
  }
}

export const sound = typeof window === "undefined" ? (null as unknown as SoundBoard) : new SoundBoard();
