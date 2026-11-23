/**
 * Race physics for the hero scene.
 *
 * A quasi-steady-state lap model, the same idea teams use for lap-time simulation:
 *  - Cornering: grip comes from the tyres' friction coefficient times the load, and the
 *    load grows with speed because of downforce. So v² · κ = μ · (g + k·v²) gives each
 *    corner its limit speed (and fast sweepers become flat out).
 *  - Straights: power-limited acceleration (P / m·v) minus aerodynamic drag (½ρC_dA·v²).
 *  - Braking: grip-limited deceleration, again boosted by downforce and drag.
 * A forward pass (accelerate out of every corner) and a backward pass (brake into every
 * corner) give the fastest speed the car can carry at each point of the lap.
 *
 * Cars then race on that envelope with their own performance, tyre wear, slipstream and DRS.
 */

export const G = 9.81;
const RHO = 1.2; // air density, kg/m³

export interface CarSpec {
  mass: number; // kg, car with driver
  power: number; // W at the wheels (ICE + ERS)
  cda: number; // drag area, m²
  cla: number; // downforce area, m²
  mu: number; // tyre friction coefficient
}

/** Roughly a current Formula 1 car. */
export const F1: CarSpec = { mass: 800, power: 720_000, cda: 1.25, cla: 4.2, mu: 1.75 };

const drag = (c: CarSpec, v: number, dragScale = 1) => 0.5 * RHO * c.cda * dragScale * v * v;
const down = (c: CarSpec, v: number) => 0.5 * RHO * c.cla * v * v;

/** Forward acceleration available at speed v (m/s²), power- and grip-limited, minus drag. */
export function accel(c: CarSpec, v: number, dragScale = 1) {
  const grip = (c.mu * (c.mass * G + down(c, v))) / c.mass;
  const power = c.power / (c.mass * Math.max(v, 3));
  return Math.min(grip * 0.62, power) - drag(c, v, dragScale) / c.mass; // rear-wheel traction ≈ 62% of total grip
}

/** Braking deceleration available at speed v (m/s²). */
export function brake(c: CarSpec, v: number) {
  return (c.mu * (c.mass * G + down(c, v)) + drag(c, v)) / c.mass;
}

/** Highest speed (m/s) a curve of curvature κ (1/m) can be taken at. */
export function cornerLimit(c: CarSpec, kappa: number) {
  const k = (0.5 * RHO * c.cla) / c.mass;
  const denom = Math.abs(kappa) - c.mu * k;
  if (denom <= 0) return Infinity; // downforce outgrows the need: flat out
  return Math.sqrt((c.mu * G) / denom);
}

/**
 * Fastest possible speed at each of `n` equally spaced points around a closed lap of
 * length `lap` metres with the given curvature. Two laps of forward and backward passes
 * make the closed loop consistent.
 */
export function speedProfile(c: CarSpec, kappa: Float32Array, lap: number): Float32Array {
  const n = kappa.length;
  const ds = lap / n;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(cornerLimit(c, kappa[i]), 120);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const i = k,
        j = (k + 1) % n;
      const reach = Math.sqrt(v[i] * v[i] + 2 * Math.max(0.1, accel(c, v[i])) * ds);
      if (reach < v[j]) v[j] = reach;
    }
    for (let k = n - 1; k >= 0; k--) {
      const i = k,
        j = (k + 1) % n;
      const reach = Math.sqrt(v[j] * v[j] + 2 * brake(c, v[j]) * ds);
      if (reach < v[i]) v[i] = reach;
    }
  }
  return v;
}

/** Lap time (s) for a speed profile. */
export function lapTime(v: Float32Array, lap: number) {
  const ds = lap / v.length;
  let t = 0;
  for (let i = 0; i < v.length; i++) t += ds / Math.max(1, v[i]);
  return t;
}

/** Signed curvature (1/m) at each of n points, from unit tangents spaced `ds` metres apart. */
export function curvature(tangents: { x: number; z: number }[], ds: number) {
  const n = tangents.length;
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = tangents[(i - 1 + n) % n],
      b = tangents[(i + 1) % n];
    const cross = a.x * b.z - a.z * b.x;
    const dot = a.x * b.x + a.z * b.z;
    k[i] = Math.atan2(cross, dot) / (2 * ds);
  }
  // light smoothing so kerb-to-kerb noise does not create fake corners
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = -3; d <= 3; d++) s += k[(i + d + n) % n];
    out[i] = s / 7;
  }
  return out;
}
