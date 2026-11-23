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
  carLen: number; // a car's drawn length plus a safety margin, in metres along the lap
  carWid: number; // a car's drawn width plus a little air, in drawing units
  pts: { x: number; z: number }[]; // centre line, drawing units
  tans: { x: number; z: number }[];
  sides: { x: number; z: number }[];
  half: { len: number; wid: number }; // half the drawn car footprint, with a little air
}

const mod1 = (u: number) => ((u % 1) + 1) % 1;
export const at = (tr: Track, arr: Float32Array, s: number) => arr[Math.floor(mod1(s / tr.lap) * tr.n) % tr.n];

/** Build the physics track from unit tangents and side vectors sampled around the lap. */
export function buildTrack(
  tangents: { x: number; z: number }[],
  sides: { x: number; z: number }[],
  points: { x: number; z: number }[],
  lap: number,
  halfWidth: number,
  car: { length: number; width: number; unitsPerMetre: number },
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
  return {
    n,
    lap,
    edge,
    kappa,
    profile,
    line: smooth(raw, 12),
    ideal: lapTime(profile, lap),
    // The circuit is drawn shorter than it is simulated, so spacing must use the car's drawn
    // size converted into lap metres (plus room for the shorter inside line in corners).
    carLen: (car.length * 1.15) / car.unitsPerMetre,
    carWid: car.width * 1.15,
    pts: points,
    tans: tangents,
    sides,
    half: { len: (car.length / 2) * 1.08, wid: (car.width / 2) * 1.12 },
  };
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

export function makeCar(i: number, strength: number, tr: Track, rand: () => number = Math.random): SimCar {
  const s0 = -(i + 0.5) * tr.carLen * 1.35; // grid slots a car length and a half apart, staggered
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


interface Pose {
  cx: number;
  cz: number;
  fx: number;
  fz: number;
}

/** Where a car is drawn: centre and heading on screen, for a given lateral offset. */
function pose(tr: Track, s: number, lane: number): Pose {
  const f = mod1(s / tr.lap) * tr.n;
  const i = Math.floor(f) % tr.n,
    j = (i + 1) % tr.n,
    w = f - Math.floor(f);
  const lerp = (a: { x: number; z: number }[], k: "x" | "z") => a[i][k] * (1 - w) + a[j][k] * w;
  const tx = lerp(tr.tans, "x"),
    tz = lerp(tr.tans, "z"),
    l = Math.hypot(tx, tz) || 1;
  const fx = tx / l,
    fz = tz / l;
  // side vector is (-t.z, t.x), the same as the renderer uses
  return { cx: lerp(tr.pts, "x") - fz * lane, cz: lerp(tr.pts, "z") + fx * lane, fx, fz };
}

/** Do two drawn car footprints overlap? (separating axis test on rotated rectangles) */
function touching(a: Pose, b: Pose, h: Track["half"]) {
  const axes = [
    [a.fx, a.fz],
    [-a.fz, a.fx],
    [b.fx, b.fz],
    [-b.fz, b.fx],
  ];
  for (const [ax, az] of axes) {
    const ext = (p: Pose) => h.len * Math.abs(p.fx * ax + p.fz * az) + h.wid * Math.abs(-p.fz * ax + p.fx * az);
    const d = Math.abs((a.cx - b.cx) * ax + (a.cz - b.cz) * az);
    if (d > ext(a) + ext(b)) return false;
  }
  return true;
}

/** Distance from B to A along the lap, wrapped to the nearest copy (handles lapping). */
const wrapGap = (tr: Track, a: number, b: number) => {
  let d = (a - b) % tr.lap;
  if (d > tr.lap / 2) d -= tr.lap;
  if (d < -tr.lap / 2) d += tr.lap;
  return d;
};

/**
 * Keep every pair of cars apart, checked on the cars as drawn. Alongside, they open the gap
 * sideways inside the track; nose to tail, the car behind drops back until it is clear.
 */
function separate(cars: SimCar[], tr: Track) {
  for (let pass = 0; pass < 3; pass++) {
    for (let a = 0; a < cars.length; a++)
      for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a],
          B = cars[b];
        const ds = wrapGap(tr, A.s, B.s);
        if (Math.abs(ds) > tr.carLen * 3) continue;
        const pa = pose(tr, A.s, A.lane),
          pb = pose(tr, B.s, B.lane);
        if (!touching(pa, pb, tr.half)) continue;
        // how far apart they are along A's heading vs across it
        const along = (pa.cx - pb.cx) * pa.fx + (pa.cz - pb.cz) * pa.fz;
        const front = ds >= 0 ? A : B,
          back = ds >= 0 ? B : A;
        if (Math.abs(along) < tr.half.len * 1.1) {
          // alongside: move apart sideways, staying inside the track
          const dl = A.lane - B.lane;
          const dir = Math.abs(dl) > 1e-4 ? Math.sign(dl) : A.i < B.i ? 1 : -1;
          for (const [car, d] of [
            [A, dir],
            [B, -dir],
          ] as [SimCar, number][]) {
            const line = at(tr, tr.line, car.s) * car.lineScale;
            car.lane = Math.max(-tr.edge, Math.min(tr.edge, car.lane + d * tr.carWid * 0.08));
            car.side = car.lane - line;
            car.sideTarget = car.side;
          }
          // if they are against the edge and still touching, the one behind yields
          if (touching(pose(tr, A.s, A.lane), pose(tr, B.s, B.lane), tr.half)) back.s -= tr.carLen * 0.04;
        } else {
          // nose to tail: the car behind drops back until it is clear
          for (let k = 0; k < 80 && touching(pose(tr, front.s, front.lane), pose(tr, back.s, back.lane), tr.half); k++)
            back.s -= tr.carLen * 0.025;
          back.v = Math.min(back.v, front.v);
        }
      }
  }
}

/** True if moving `c` to `lane` would put it into another car's drawn space. */
function blocked(c: SimCar, lane: number, cars: SimCar[], tr: Track) {
  const me = pose(tr, c.s, lane);
  return cars.some(
    (o) => o !== c && Math.abs(wrapGap(tr, o.s, c.s)) < tr.carLen * 3 && touching(me, pose(tr, o.s, o.lane), tr.half),
  );
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
    const minGap = tr.carLen * 1.25 + c.v * 0.14; // a car length plus about 0.14 s at speed
    const line = at(tr, tr.line, c.s);
    const myLat = line * c.lineScale + c.side;
    const aheadLat = ahead ? at(tr, tr.line, ahead.s) * ahead.lineScale + ahead.side : 0;
    const overlap = !!ahead && Math.abs(myLat - aheadLat) < tr.carWid;
    if (ahead && gapM < minGap + tr.carLen * 1.5 && overlap) {
      const canPass = straight && c.v > ahead.v + 0.5 && (c.drs || slip < 0.99);
      if (canPass) {
        const want = aheadLat > 0 ? aheadLat - tr.carWid * 1.08 : aheadLat + tr.carWid * 1.08;
        c.sideTarget = Math.max(-tr.edge, Math.min(tr.edge, want)) - line * c.lineScale;
      } else if (gapM < minGap + tr.carLen * 0.6) {
        target = Math.min(target, ahead.v + (gapM - minGap) * 0.6); // hold station, don't tailgate
      }
    } else if (!ahead || gapM > minGap + tr.carLen * 1.8) {
      // Clear air ahead: back onto the racing line, but only once the car just passed is clear.
      const behind = byPos[rank + 1];
      const mirrorsClear = !behind || c.s - behind.s > tr.carLen * 1.3;
      if (mirrorsClear) c.sideTarget = 0;
    }
    if (ahead && gapM < 5.5 && overlap) target = Math.min(target, ahead.v * 0.97); // never drive through a car
    if (c.v < target) c.v = Math.min(target, c.v + accel(F1, c.v, dragScale) * grip * dt);
    else c.v = Math.max(Math.max(0, target), c.v - brake(F1, c.v) * grip * dt);
    const nextSide = c.side + (c.sideTarget - c.side) * Math.min(1, dt * 1.2);
    const nextLane = Math.max(-tr.edge, Math.min(tr.edge, line * c.lineScale + nextSide));
    // Look before moving over: never steer into a car that is alongside.
    if (!blocked(c, nextLane, cars, tr) || Math.abs(nextLane) < Math.abs(c.lane)) c.side = nextSide;
    c.lane = Math.max(-tr.edge, Math.min(tr.edge, line * c.lineScale + c.side));
    c.aLong = (c.v - vPrev) / dt;
    c.aLat = c.v * c.v * k;
    const before = Math.floor(c.s / tr.lap);
    c.s += c.v * dt;
    if (Math.floor(c.s / tr.lap) > before && c.s > 0) {
      c.lap++;
      c.wear = Math.min(0.04, c.wear + 0.0025); // tyres lose a little grip every lap
      c.form = (rand() - 0.5) * 0.006; // no two laps are the same
      hooks.onLap?.(c);
    }
  });
  separate(cars, tr); // two cars never share the same piece of track
}
