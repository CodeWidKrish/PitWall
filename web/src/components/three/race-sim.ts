/**
 * The race itself, separate from drawing it: cars on a real-scale lap with a racing
 * line, real following gaps, dirty air, slipstream, DRS, overtakes, tyre wear, form,
 * start reactions and the odd mistake. Pure maths, so it can be tested on its own.
 */
import { accel, brake, curvature, F1, lapTime, speedProfile } from "@/components/three/physics";

export interface Track {
  n: number;
  lap: number; // metres
  edge: number; // furthest lateral offset from the centre line, in drawing units
  kappa: Float32Array;
  profile: Float32Array; // fastest speed at each point, m/s
  line: Float32Array; // racing line offset at each point, drawing units (+ = side vector)
  ideal: number; // lap time on the ideal envelope, s
}

const mod1 = (u: number) => ((u % 1) + 1) % 1;
export const at = (tr: Track, arr: Float32Array, s: number) => arr[Math.floor(mod1(s / tr.lap) * tr.n) % tr.n];

/** Build the physics track from unit tangents and side vectors sampled around the lap. */
export function buildTrack(
  tangents: { x: number; z: number }[],
  sides: { x: number; z: number }[],
  lap: number,
  halfWidth: number,
): Track {
  const n = tangents.length;
  const kappa = curvature(tangents, lap / n);
  const profile = speedProfile(F1, kappa, lap);
  const edge = halfWidth - 0.1;
  // Racing line: wide on entry, clip the apex, wide on exit.
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = tangents[(i - 2 + n) % n],
      b = tangents[(i + 2) % n],
      sv = sides[i];
    const inward = (b.x - a.x) * sv.x + (b.z - a.z) * sv.z;
    q[i] = Math.abs(kappa[i]) * Math.sign(inward);
  }
  const smooth = (src: Float32Array, w: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0,
        wt = 0;
      for (let d = -w; d <= w; d++) {
        const g = Math.exp(-(d * d) / (2 * (w / 2) ** 2));
        sum += src[(i + d + n) % n] * g;
        wt += g;
      }
      out[i] = sum / wt;
    }
    return out;
  };
  const qs = smooth(q, 24);
  const lead = Math.round((100 / lap) * n); // turn in about 100 m before the apex
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = qs[i] - 0.55 * (qs[(i + lead) % n] + qs[(i - lead + n) % n]);
    raw[i] = Math.tanh(v * 55) * edge;
  }
  return { n, lap, edge, kappa, profile, line: smooth(raw, 12), ideal: lapTime(profile, lap) };
}

export interface SimCar {
  i: number;
  s: number; // metres travelled
  v: number; // m/s
  lap: number;
  lane: number; // lateral offset, drawing units
  perf: number; // share of the ideal envelope this car can use
  wear: number;
  form: number;
  lineScale: number;
  side: number;
  sideTarget: number;
  reaction: number;
  mistake: number;
  drs: boolean;
  aLong: number;
  aLat: number;
  lapStart: number;
}

export function makeCar(i: number, strength: number, rand: () => number = Math.random): SimCar {
  const s0 = -i * 8 - 3; // grid slots 8 m apart, staggered left and right
  const gridSide = (i % 2 ? 1 : -1) * 0.16;
  return {
    i,
    s: s0,
    v: 0,
    lap: 0,
    lane: gridSide,
    // Real pace gaps: about 2.5% of lap time from the quickest to the slowest of ten.
    perf: 0.95 + 0.05 * strength + (rand() - 0.5) * 0.006,
    wear: 0,
    form: 0,
    lineScale: 0.82 + rand() * 0.18,
    side: gridSide,
    sideTarget: gridSide,
    reaction: 0.16 + rand() * 0.3,
    mistake: 0,
    drs: false,
    aLong: 0,
    aLat: 0,
    lapStart: 0,
  };
}

export interface Hooks {
  onLap?: (c: SimCar) => void;
  onMistake?: (c: SimCar) => void;
}

/** Advance every car by `dt` real seconds. `t` is the race clock after this step. */
export function stepRace(cars: SimCar[], tr: Track, dt: number, t: number, hooks: Hooks = {}, rand: () => number = Math.random) {
  const byPos = cars.slice().sort((a, b) => b.s - a.s);
  byPos.forEach((c, rank) => {
    if (t < c.reaction) return; // still reacting to the lights
    const ahead = rank > 0 ? byPos[rank - 1] : null;
    const gapM = ahead ? ahead.s - c.s : Infinity;
    const gapT = gapM / Math.max(c.v, 10);
    const k = at(tr, tr.kappa, c.s);
    const straight = Math.abs(k) < 0.004;
    // Dirty air: within about a second, the car behind loses front grip in corners.
    const dirty = !straight && gapT < 1.2 ? 0.93 + 0.058 * gapT : 1;
    // Tow on a straight within a second (about +5 km/h at the end of a straight), and DRS
    // from the second lap (about +10 km/h). Top speed scales with drag^-1/3.
    const slip = straight && gapT < 1 ? 0.955 + 0.045 * gapT : 1;
    c.drs = straight && c.lap >= 1 && gapT < 1;
    const dragScale = slip * (c.drs ? 0.92 : 1);
    const launchGrip = t < 4 ? 0.88 + 0.03 * t : 1;
    let grip = c.perf * (1 - c.wear) * (1 + c.form) * dirty * launchGrip;
    if (c.mistake > 0) {
      c.mistake -= dt;
      grip *= 0.86;
    } else if (!straight && c.lap >= 1 && rand() < 0.0025 * dt) {
      c.mistake = 0.7 + rand() * 0.6; // a lock-up or a moment: slower for a beat
      hooks.onMistake?.(c);
    }
    // Corner speed scales with √grip; top speed with drag^-1/3 (power = drag × v).
    let target = at(tr, tr.profile, c.s) * Math.sqrt(grip) * (straight ? Math.pow(dragScale, -1 / 3) : 1);
    const vPrev = c.v;
    const minGap = 7 + c.v * 0.14; // about 0.14 s at speed, a car length when slow
    const line = at(tr, tr.line, c.s);
    const myLat = line * c.lineScale + c.side;
    const aheadLat = ahead ? at(tr, tr.line, ahead.s) * ahead.lineScale + ahead.side : 0;
    const overlap = !!ahead && Math.abs(myLat - aheadLat) < 0.17;
    if (ahead && gapM < minGap + 25 && overlap) {
      const canPass = straight && c.v > ahead.v + 0.5 && (c.drs || slip < 0.99);
      if (canPass) {
        const want = aheadLat > 0 ? aheadLat - 0.2 : aheadLat + 0.2;
        c.sideTarget = Math.max(-tr.edge, Math.min(tr.edge, want)) - line * c.lineScale;
      } else if (gapM < minGap + 8) {
        target = Math.min(target, ahead.v + (gapM - minGap) * 0.6); // hold station, don't tailgate
      }
    } else if (!ahead || gapM > minGap + 30) {
      // Clear air ahead: back onto the racing line, but only once the car just passed is clear.
      const behind = byPos[rank + 1];
      const mirrorsClear = !behind || c.s - behind.s > 12;
      if (mirrorsClear) c.sideTarget = 0;
    }
    if (ahead && gapM < 5.5 && overlap) target = Math.min(target, ahead.v * 0.97); // never drive through a car
    if (c.v < target) c.v = Math.min(target, c.v + accel(F1, c.v, dragScale) * grip * dt);
    else c.v = Math.max(Math.max(0, target), c.v - brake(F1, c.v) * grip * dt);
    c.side += (c.sideTarget - c.side) * Math.min(1, dt * 1.2);
    c.lane = Math.max(-tr.edge, Math.min(tr.edge, line * c.lineScale + c.side));
    c.aLong = (c.v - vPrev) / dt;
    c.aLat = c.v * c.v * k;
    const before = Math.floor(c.s / tr.lap);
    c.s += c.v * dt;
    // Two cars can never share the same piece of track: stay a car length behind if in line.
    if (ahead && Math.abs(c.lane - ahead.lane) < 0.16 && c.s > ahead.s - 5.6 && c.s < ahead.s + 2) {
      c.s = ahead.s - 5.6;
      c.v = Math.min(c.v, ahead.v);
    }
    if (Math.floor(c.s / tr.lap) > before && c.s > 0) {
      c.lap++;
      c.wear = Math.min(0.04, c.wear + 0.0025); // tyres lose a little grip every lap
      c.form = (rand() - 0.5) * 0.006; // no two laps are the same
      hooks.onLap?.(c);
    }
  });
}
