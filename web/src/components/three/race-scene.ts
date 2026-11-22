/**
 * The hero's night race, ported from the approved prototype: a floodlit street
 * circuit, the real grid's top cars in their team colours, and three cameras
 * (broadcast director, onboard with telemetry, free orbit).
 *
 * Plain three.js, driven from React through a small controller. The cars are
 * drawn in code as a generic modern F1 car; the realistic model comes later.
 */
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type CamMode = "tv" | "board" | "orbit";

export interface SceneCar {
  id: string;
  code: string;
  colour: string;
  accent: string;
  strength: number; // 0..1, from the model's win odds
}

export interface Telemetry {
  speed: number;
  gear: number | "N";
  rpm: number; // 0..1 within the gear
  drs: boolean;
  ers: number;
  position: number;
  lap: number;
  throttle: number; // 0..1, for the engine sound
}

export interface SceneEvents {
  onTower?: (rows: { id: string; gap: string; delta: -1 | 0 | 1 }[], lap: number) => void;
  onBanner?: (kind: "overtake" | "fastest" | "radio", text: string, carId: string) => void;
  onTelemetry?: (t: Telemetry) => void;
  onShot?: (label: string) => void;
  onPassBy?: (closeness: number) => void; // a car went past a trackside camera
  onTags?: (tags: { id: string; x: number; y: number; visible: boolean }[]) => void;
}

export interface RaceController {
  setCam: (m: CamMode) => void;
  setFollow: (id: string) => void;
  launch: () => void;
  dispose: () => void;
}

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const mod1 = (u: number) => ((u % 1) + 1) % 1;
const COMPOUND = ["#FF3B3B", "#FFD12E", "#F2F4F7"];

/* ------------------------------------------------------------ textures */
function canvasTex(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat?: [number, number],
  srgb = true,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 8;
  return t;
}

function textures() {
  const weave = canvasTex(
    64,
    64,
    (x, w, h) => {
      x.fillStyle = "#111215";
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const a = (i + j) % 2;
          x.fillStyle = a ? "#1c1e22" : "#0c0d0f";
          x.fillRect(i * 8, j * 8, 8, 8);
          x.fillStyle = "rgba(255,255,255,.05)";
          if (a) x.fillRect(i * 8, j * 8, 8, 2);
          else x.fillRect(i * 8, j * 8, 2, 8);
        }
    },
    [10, 10],
  );
  const blob = canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(0,0,0,.92)");
    g.addColorStop(0.55, "rgba(0,0,0,.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  const asphalt = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = "#2c2e32";
      x.fillRect(0, 0, w, h);
      const im = x.getImageData(0, 0, w, h);
      for (let p = 0; p < im.data.length; p += 4) {
        const n = (Math.random() - 0.5) * 30 + (Math.random() < 0.02 ? 30 : 0);
        im.data[p] += n;
        im.data[p + 1] += n;
        im.data[p + 2] += n;
      }
      x.putImageData(im, 0, 0);
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.3, "rgba(0,0,0,.32)");
      g.addColorStop(0.62, "rgba(0,0,0,.32)");
      g.addColorStop(1, "rgba(0,0,0,.04)");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
    [1, 90],
  );
  const ads = canvasTex(
    1024,
    64,
    (x, w, h) => {
      const pan = ["#16181c", "#1f2228", "#5b2ab8", "#16181c", "#ECEDEF", "#1f2228", "#0f1a2b", "#16181c"];
      pan.forEach((c, k) => {
        x.fillStyle = c;
        x.fillRect(k * 128, 0, 128, h);
      });
      x.font = 'italic 800 30px "Arial Narrow", Arial, sans-serif';
      x.textBaseline = "middle";
      (
        [
          [2, "#fff", "PITWALL"],
          [4, "#0B0C0E", "PITWALL"],
          [6, "#8F45FF", "PITWALL"],
        ] as const
      ).forEach(([k, c, s]) => {
        x.fillStyle = c;
        x.fillText(s, k * 128 + 12, h / 2 + 2);
      });
      x.fillStyle = "rgba(255,255,255,.18)";
      x.fillRect(0, 0, w, 3);
    },
    [70, 1],
  );
  const fence = canvasTex(
    64,
    64,
    (x, w, h) => {
      x.fillStyle = "#000";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "#fff";
      x.lineWidth = 2;
      for (let k = -64; k < 128; k += 16) {
        x.beginPath();
        x.moveTo(k, 0);
        x.lineTo(k + 64, 64);
        x.stroke();
        x.beginPath();
        x.moveTo(k + 64, 0);
        x.lineTo(k, 64);
        x.stroke();
      }
    },
    [260, 3],
    false,
  );
  const windows = canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = "#000";
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 16; j++)
        if (Math.random() < 0.42) {
          const v = (120 + Math.random() * 135) | 0;
          x.fillStyle = `rgb(${v},${(v * 0.88) | 0},${(v * 0.62) | 0})`;
          x.fillRect(4 + i * 10, 4 + j * 7.6, 6, 4);
        }
  });
  const checker = canvasTex(64, 16, (x) => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 4; b++) {
        x.fillStyle = (a + b) % 2 ? "#111" : "#eee";
        x.fillRect(a * 4, b * 4, 4, 4);
      }
  });
  return { weave, blob, asphalt, ads, fence, windows, checker };
}

/* ------------------------------------------------------------ geometry */
type Vec3 = [number, number, number];
function place(g: T.BufferGeometry, p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]) {
  g.applyMatrix4(new T.Matrix4().compose(V(...p), new T.Quaternion().setFromEuler(new T.Euler(...r)), V(...s)));
  return g;
}
function rod(a: Vec3, b: Vec3, r: number) {
  const A = V(...a),
    B = V(...b);
  const g = new T.CylinderGeometry(r, r, A.distanceTo(B), 6);
  g.applyMatrix4(
    new T.Matrix4().compose(
      A.clone().add(B).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize()),
      V(1, 1, 1),
    ),
  );
  return g;
}
function shape(pts: [number, number][]) {
  const s = new T.Shape();
  pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  s.closePath();
  return s;
}
function sidePart(pts: [number, number][], x0: number, depth: number, bevel = 0) {
  const g = new T.ExtrudeGeometry(shape(pts), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  g.applyMatrix4(new T.Matrix4().set(0, 0, -1, x0 + depth, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return g;
}
function planPart(pts: [number, number][], y0: number, depth: number) {
  const g = new T.ExtrudeGeometry(shape(pts), { depth, bevelEnabled: false });
  g.applyMatrix4(new T.Matrix4().set(1, 0, 0, 0, 0, 0, -1, y0, 0, 1, 0, 0, 0, 0, 0, 1));
  return g;
}

type PartKey = "paint" | "accent" | "carbon" | "tyre" | "rim" | "stripe" | "glow" | "helmet" | "drs";

/** A generic modern F1 car in metres, nose toward +z, merged into one geometry per material. */
function buildCarParts(): Record<PartKey, T.BufferGeometry | null> {
  const P: Record<PartKey, T.BufferGeometry[]> = {
    paint: [],
    accent: [],
    carbon: [],
    tyre: [],
    rim: [],
    stripe: [],
    glow: [],
    helmet: [],
    drs: [],
  };
  const add = (k: PartKey, g: T.BufferGeometry) => P[k].push(g.index ? g.toNonIndexed() : g);
  const both = (fn: (s: number) => void) => {
    fn(1);
    fn(-1);
  };
  add("carbon", planPart([[-0.22, 1.2], [0.22, 1.2], [0.8, 0.35], [0.84, -1.45], [0.6, -2.0], [-0.6, -2.0], [-0.84, -1.45], [-0.8, 0.35]], 0.09, 0.035));
  add("carbon", place(new T.BoxGeometry(1.1, 0.02, 0.55), [0, 0.2, -2.25], [0.32, 0, 0]));
  add("carbon", place(new T.BoxGeometry(0.26, 0.22, 0.55), [0, 0.32, -2.08]));
  add("paint", place(new T.CylinderGeometry(0.075, 0.25, 1.55, 18, 1), [0, 0.3, 1.78], [Math.PI / 2 + 0.07, 0, 0], [1, 1, 0.72]));
  add("paint", place(new T.SphereGeometry(0.075, 14, 10), [0, 0.245, 2.55], [0, 0, 0], [1, 0.72, 1.5]));
  add("paint", place(new T.CylinderGeometry(0.31, 0.33, 1.45, 20, 1), [0, 0.4, 0.35], [Math.PI / 2, 0, 0], [1.12, 1, 0.82]));
  add("accent", place(new T.CylinderGeometry(0.2, 0.26, 0.9, 18, 1, true), [0, 0.405, 1.0], [Math.PI / 2 + 0.05, 0, 0], [1.13, 1, 0.8]));
  add("carbon", place(new T.CylinderGeometry(0.2, 0.2, 0.04, 24), [0, 0.665, 0.22], [0, 0, 0], [0.85, 1, 1.75]));
  add("helmet", place(new T.SphereGeometry(0.13, 22, 16), [0, 0.72, 0.14]));
  add("carbon", place(new T.BoxGeometry(0.21, 0.045, 0.06), [0, 0.735, 0.25]));
  add("carbon", place(new T.TorusGeometry(0.33, 0.028, 8, 30, Math.PI), [0, 0.84, 0.18], [Math.PI / 2, 0, 0], [1, 1.3, 1]));
  both((s) => add("carbon", rod([s * 0.33, 0.84, 0.18], [s * 0.3, 0.63, -0.22], 0.03)));
  add("carbon", rod([0, 0.84, 0.61], [0, 0.66, 0.86], 0.034));
  add("paint", sidePart([[0.05, 0.66], [-0.25, 0.99], [-0.62, 0.99], [-1.55, 0.66], [-2.05, 0.48], [-2.05, 0.3], [0.05, 0.3]], -0.19, 0.38, 0.05));
  add("carbon", place(new T.CylinderGeometry(0.11, 0.11, 0.06, 18), [0, 0.9, -0.24], [Math.PI / 2, 0, 0], [1, 1, 1.15]));
  add("accent", sidePart([[-0.62, 0.99], [-1.75, 0.79], [-1.95, 0.63], [-1.1, 0.63]], -0.008, 0.016));
  add("accent", place(new T.BoxGeometry(0.09, 0.05, 0.14), [0, 1.04, -0.45]));
  const pod: [number, number][] = [[0.78, 0.54], [0.78, 0.22], [0.55, 0.15], [-0.2, 0.12], [-1.45, 0.15], [-1.6, 0.3], [-0.5, 0.5], [0.2, 0.57]];
  add("paint", sidePart(pod, 0.3, 0.4, 0.07));
  add("paint", sidePart(pod, -0.7, 0.4, 0.07));
  both((s) => add("carbon", place(new T.BoxGeometry(0.34, 0.26, 0.05), [s * 0.51, 0.38, 0.84])));
  both((s) => add("accent", place(new T.BoxGeometry(0.02, 0.1, 1.1), [s * 0.79, 0.3, -0.4])));
  both((s) => {
    add("carbon", place(new T.BoxGeometry(0.17, 0.07, 0.04), [s * 0.6, 0.64, 0.62]));
    add("carbon", rod([s * 0.36, 0.58, 0.6], [s * 0.54, 0.64, 0.62], 0.012));
  });
  add("carbon", place(new T.BoxGeometry(1.98, 0.022, 0.34), [0, 0.1, 2.55], [0.04, 0, 0]));
  add("paint", place(new T.BoxGeometry(1.76, 0.016, 0.18), [0, 0.155, 2.43], [0.38, 0, 0]));
  add("accent", place(new T.BoxGeometry(1.56, 0.016, 0.13), [0, 0.205, 2.34], [0.6, 0, 0]));
  both((s) => {
    add("carbon", place(new T.BoxGeometry(0.022, 0.24, 0.5), [s * 0.99, 0.16, 2.5]));
    add("carbon", rod([s * 0.12, 0.16, 2.42], [s * 0.1, 0.27, 2.3], 0.014));
  });
  both((s) => add("paint", place(new T.BoxGeometry(0.022, 0.62, 0.62), [s * 0.5, 0.72, -2.25])));
  add("carbon", place(new T.BoxGeometry(1.0, 0.03, 0.32), [0, 0.8, -2.2], [0.12, 0, 0]));
  add("drs", place(new T.BoxGeometry(1.0, 0.022, 0.2), [0, 0.935, -2.33], [0.55, 0, 0]));
  add("carbon", place(new T.BoxGeometry(0.82, 0.02, 0.18), [0, 0.42, -2.18], [0.15, 0, 0]));
  add("carbon", place(new T.BoxGeometry(0.04, 0.42, 0.08), [0, 0.6, -2.06]));
  add("glow", place(new T.BoxGeometry(0.13, 0.06, 0.03), [0, 0.3, -2.52]));
  const tyreGeo = (w: number) => {
    const h = w / 2;
    return new T.LatheGeometry(
      (
        [
          [0.23, -h],
          [0.32, -h - 0.004],
          [0.35, -h * 0.82],
          [0.362, -h * 0.45],
          [0.362, h * 0.45],
          [0.35, h * 0.82],
          [0.32, h + 0.004],
          [0.23, h],
        ] as [number, number][]
      ).map(([r, y]) => new T.Vector2(r, y)),
      40,
    );
  };
  (
    [
      [0.84, 1.62, 0.305],
      [-0.84, 1.62, 0.305],
      [0.8, -1.75, 0.405],
      [-0.8, -1.75, 0.405],
    ] as Vec3[]
  ).forEach(([x, z, w]) => {
    const s = Math.sign(x);
    add("tyre", place(tyreGeo(w), [x, 0.362, z], [0, 0, Math.PI / 2]));
    add("rim", place(new T.CylinderGeometry(0.232, 0.232, w * 0.96, 30), [x, 0.362, z], [0, 0, Math.PI / 2]));
    add("stripe", place(new T.TorusGeometry(0.3, 0.008, 6, 56), [x + s * (w / 2 + 0.003), 0.362, z], [0, Math.PI / 2, 0]));
    add("accent", place(new T.TorusGeometry(0.15, 0.014, 6, 36), [x + s * (w * 0.48 + 0.006), 0.362, z], [0, Math.PI / 2, 0]));
  });
  both((s) => {
    (
      [
        [0.2, 0.48, 1.45],
        [0.2, 0.48, 1.85],
      ] as Vec3[]
    ).forEach((a) => add("carbon", rod([s * a[0], a[1], a[2]], [s * 0.68, 0.44, 1.62], 0.016)));
    (
      [
        [0.22, 0.26, 1.5],
        [0.22, 0.26, 1.8],
      ] as Vec3[]
    ).forEach((a) => add("carbon", rod([s * a[0], a[1], a[2]], [s * 0.68, 0.3, 1.62], 0.016)));
    add("carbon", rod([s * 0.25, 0.3, 1.66], [s * 0.66, 0.46, 1.6], 0.014));
    (
      [
        [0.25, 0.45, -1.55],
        [0.25, 0.45, -1.95],
      ] as Vec3[]
    ).forEach((a) => add("carbon", rod([s * a[0], a[1], a[2]], [s * 0.62, 0.44, -1.75], 0.016)));
    (
      [
        [0.25, 0.28, -1.6],
        [0.25, 0.28, -1.9],
      ] as Vec3[]
    ).forEach((a) => add("carbon", rod([s * a[0], a[1], a[2]], [s * 0.62, 0.3, -1.75], 0.016)));
  });
  const M = {} as Record<PartKey, T.BufferGeometry | null>;
  (Object.keys(P) as PartKey[]).forEach((k) => (M[k] = P[k].length ? mergeGeometries(P[k], false) : null));
  return M;
}

/* --------------------------------------------------------------- scene */
export function createRaceScene(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  grid: SceneCar[],
  followId: string,
  ev: SceneEvents = {},
): RaceController | null {
  const small = innerWidth < 760;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const tex = textures();
  const PR = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  renderer.setPixelRatio(PR);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0x07080a);
  scene.fog = new T.FogExp2(0x07080a, 0.03);
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new T.PerspectiveCamera(30, 1, 0.02, 220);

  scene.add(new T.HemisphereLight(0x9aa8d8, 0x08080a, 0.5));
  const key = new T.DirectionalLight(0xe4ebff, 2.4);
  key.position.set(-6, 14, 7);
  key.castShadow = !small;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const warm = new T.DirectionalLight(0xffe0b0, 1.1);
  warm.position.set(9, 8, -7);
  scene.add(warm);

  // circuit
  const PTS: [number, number][] = [[-7, 2], [-7.2, -1], [-6, -3], [-3, -3.2], [-1, -2.6], [0.2, -4.2], [1.6, -5.4], [4.5, -5.2], [6.6, -4], [6.8, -1.6], [5.2, 0.2], [5.6, 1.8], [7.2, 3], [6.4, 4.8], [3, 5], [-1, 4.6], [-3.2, 3.2], [-5.2, 4.6], [-6.6, 4]];
  const curve = new T.CatmullRomCurve3(
    PTS.map(([x, z], k) => V(x, Math.sin((k / PTS.length) * Math.PI * 4) * 0.16, z)),
    true,
    "centripetal",
  );
  const N = 1000,
    HW = 0.52;
  const frames: { p: T.Vector3; t: T.Vector3; s: T.Vector3 }[] = [];
  for (let i = 0; i <= N; i++) {
    const u = (i % N) / N;
    const p = curve.getPointAt(u),
      t = curve.getTangentAt(u);
    frames.push({ p, t, s: V(-t.z, 0, t.x).normalize() });
  }
  const curv = frames.map((f, i) => f.t.angleTo(frames[(i + 6) % N].t));
  const cornerF = Array.from({ length: N }, (_, i) => {
    let s = 0;
    for (let k = -10; k <= 10; k++) s += curv[(i + k + N) % N];
    s /= 21;
    return 1 - Math.min(1, s / 0.15) * 0.62;
  });
  const sfAt = (u: number) => cornerF[Math.floor(mod1(u) * N) % N];

  function ribbon(a: number, b: number, o: { y?: number; color?: (i: number) => T.Color } = {}) {
    const pos: number[] = [],
      uv: number[] = [],
      colr: number[] = [],
      idx: number[] = [];
    frames.forEach((f, i) => {
      const A = f.p.clone().addScaledVector(f.s, a),
        B = f.p.clone().addScaledVector(f.s, b),
        y = o.y ?? 0;
      pos.push(A.x, A.y + y, A.z, B.x, B.y + y, B.z);
      const v = i / N;
      uv.push(0, v, 1, v);
      if (o.color) {
        const c = o.color(i);
        colr.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      if (i < N) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    if (o.color) g.setAttribute("color", new T.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function wall(off: number, h0: number, h1: number) {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    frames.forEach((f, i) => {
      const A = f.p.clone().addScaledVector(f.s, off);
      pos.push(A.x, A.y + h0, A.z, A.x, A.y + h1, A.z);
      const v = i / N;
      uv.push(v, 0, v, 1);
      if (i < N) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const trackMat = new T.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.82, metalness: 0, envMapIntensity: 0.3, side: T.DoubleSide });
  const track = new T.Mesh(ribbon(-HW, HW), trackMat);
  track.receiveShadow = true;
  scene.add(track);
  const lineMat = new T.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, side: T.DoubleSide });
  scene.add(new T.Mesh(ribbon(HW - 0.045, HW - 0.02, { y: 0.002 }), lineMat));
  scene.add(new T.Mesh(ribbon(-HW + 0.02, -HW + 0.045, { y: 0.002 }), lineMat));
  const red = new T.Color(0xc8202a),
    white = new T.Color(0xe8e8e8),
    edge = new T.Color(0x2a2d33);
  const kc = (i: number) => (curv[i % N] > 0.085 ? (Math.floor(i / 4) % 2 ? red : white) : edge);
  const kerbMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: T.DoubleSide });
  (
    [
      [HW, HW + 0.11],
      [-HW - 0.11, -HW],
    ] as [number, number][]
  ).forEach(([a, b]) => {
    const m = new T.Mesh(ribbon(a, b, { color: kc, y: 0.006 }), kerbMat);
    m.receiveShadow = true;
    scene.add(m);
  });
  const runMat = new T.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.9, side: T.DoubleSide });
  (
    [
      [HW + 0.11, HW + 0.34],
      [-HW - 0.34, -HW - 0.11],
    ] as [number, number][]
  ).forEach(([a, b]) => {
    const m = new T.Mesh(ribbon(a, b), runMat);
    m.receiveShadow = true;
    scene.add(m);
  });
  const wallMat = new T.MeshStandardMaterial({ map: tex.ads, roughness: 0.6, envMapIntensity: 0.4, side: T.DoubleSide });
  const fenceMat = new T.MeshBasicMaterial({ color: 0x5f656e, alphaMap: tex.fence, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
  [HW + 0.34, -HW - 0.34].forEach((o) => {
    scene.add(new T.Mesh(wall(o, -0.02, 0.12), wallMat));
    scene.add(new T.Mesh(wall(o * 1.04, 0.12, 0.44), fenceMat));
  });
  const rl = new T.Mesh(
    new T.TubeGeometry(curve, 900, 0.006, 4, true),
    new T.MeshBasicMaterial({ color: new T.Color(1.4, 0.6, 3), toneMapped: false, transparent: true, opacity: 0.5 }),
  );
  rl.position.y = 0.01;
  scene.add(rl);
  const ground = new T.Mesh(new T.PlaneGeometry(140, 140), new T.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);
  const sfl = new T.Mesh(new T.PlaneGeometry(HW * 2, 0.1), new T.MeshStandardMaterial({ map: tex.checker, roughness: 0.6 }));
  sfl.position.copy(frames[0].p).add(V(0, 0.004, 0));
  sfl.rotation.set(-Math.PI / 2, 0, Math.atan2(frames[0].t.x, frames[0].t.z));
  scene.add(sfl);
  const dm = new T.Object3D();
  const poleIdx: number[] = [];
  for (let i = 0; i < N; i += 42) poleIdx.push(i);
  const poles = new T.InstancedMesh(new T.CylinderGeometry(0.018, 0.028, 1.8, 6), new T.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6 }), poleIdx.length);
  const heads = new T.InstancedMesh(new T.BoxGeometry(0.26, 0.07, 0.07), new T.MeshBasicMaterial({ color: new T.Color(5, 4.7, 4.2), toneMapped: false }), poleIdx.length);
  poleIdx.forEach((i, k) => {
    const f = frames[i],
      side = k % 2 ? 1 : -1;
    const p = f.p.clone().addScaledVector(f.s, side * (HW + 0.7));
    dm.position.set(p.x, p.y + 0.7, p.z);
    dm.rotation.set(0, 0, 0);
    dm.updateMatrix();
    poles.setMatrixAt(k, dm.matrix);
    dm.position.y = p.y + 1.6;
    dm.lookAt(f.p.x, p.y + 1.6, f.p.z);
    dm.updateMatrix();
    heads.setMatrixAt(k, dm.matrix);
  });
  scene.add(poles, heads);
  const pit = new T.Mesh(
    new T.BoxGeometry(0.7, 0.5, 6.5),
    new T.MeshStandardMaterial({ color: 0x14161a, emissive: 0xffffff, emissiveMap: tex.windows, emissiveIntensity: 0.7, roughness: 0.7 }),
  );
  pit.position.set(-8.75, 0.05, 0.3);
  scene.add(pit);
  const stand = new T.Group();
  for (let k = 0; k < 6; k++) {
    const b = new T.Mesh(new T.BoxGeometry(0.28, 0.12 + k * 0.12, 4.2), new T.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.8 }));
    b.position.set(-5.85 + k * 0.26, (0.12 + k * 0.12) / 2 - 0.2, 0.6);
    stand.add(b);
  }
  scene.add(stand);
  const crowdN = small ? 260 : 700;
  const crowd = new T.InstancedMesh(new T.BoxGeometry(0.03, 0.05, 0.03), new T.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.9, envMapIntensity: 0.2 }), crowdN);
  const cc = new T.Color();
  for (let n = 0; n < crowdN; n++) {
    const k = n % 6;
    dm.position.set(-5.85 + k * 0.26 + (Math.random() - 0.5) * 0.16, 0.12 + k * 0.12 - 0.2 + 0.03, 0.6 + (Math.random() - 0.5) * 4);
    dm.rotation.set(0, 0, 0);
    dm.updateMatrix();
    crowd.setMatrixAt(n, dm.matrix);
    crowd.setColorAt(n, cc.setHSL(Math.random(), 0.28, 0.1 + Math.random() * 0.18));
  }
  scene.add(crowd);
  const bN = small ? 70 : 150;
  const city = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    new T.MeshStandardMaterial({ color: 0x0d0f13, emissive: 0xffffff, emissiveMap: tex.windows, emissiveIntensity: 0.85, roughness: 0.85 }),
    bN,
  );
  for (let n = 0; n < bN; n++) {
    const a = Math.random() * Math.PI * 2,
      r = 11 + Math.random() * 16,
      h = 1 + Math.random() * Math.random() * 7;
    dm.position.set(Math.cos(a) * r * 1.15, h / 2 - 0.2, Math.sin(a) * r);
    dm.scale.set(0.6 + Math.random() * 1.2, h, 0.6 + Math.random() * 1.2);
    dm.rotation.set(0, Math.random() * 3, 0);
    dm.updateMatrix();
    city.setMatrixAt(n, dm.matrix);
  }
  dm.scale.set(1, 1, 1);
  scene.add(city);

  // cars
  const CAR = buildCarParts();
  const shared = {
    carbon: new T.MeshPhysicalMaterial({ color: 0x17181c, map: tex.weave, roughness: 0.4, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    tyre: new T.MeshStandardMaterial({ color: 0x151516, roughness: 0.93, side: T.DoubleSide }),
    rim: new T.MeshPhysicalMaterial({ color: 0x1b1d21, metalness: 0.9, roughness: 0.3, clearcoat: 0.5 }),
    glow: new T.MeshBasicMaterial({ color: new T.Color(3.2, 0.25, 0.2), toneMapped: false }),
  };
  const stripes = COMPOUND.map((h) => new T.MeshBasicMaterial({ color: h }));
  const paint = (hex: string, r = 0.24) => new T.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: r, clearcoat: 1, clearcoatRoughness: 0.05 });
  const SC = 0.46 / 5.4;
  interface Car {
    d: SceneCar;
    i: number;
    g: T.Group;
    u: number;
    lap: number;
    lane: number;
    spd: number;
    lapStart: number;
    ers: number;
    pos?: number;
  }
  const cars: Car[] = grid.map((d, i) => {
    const g = new T.Group();
    const mats: Record<PartKey, T.Material> = {
      paint: paint(d.colour),
      accent: paint(d.accent, 0.3),
      helmet: paint(d.accent === "#0E1013" ? "#ECEDEF" : d.accent, 0.18),
      drs: paint(d.accent, 0.3),
      carbon: shared.carbon,
      tyre: shared.tyre,
      rim: shared.rim,
      glow: shared.glow,
      stripe: stripes[(i * 2 + 1) % 3],
    };
    (Object.keys(CAR) as PartKey[]).forEach((k) => {
      const geo = CAR[k];
      if (!geo) return;
      const m = new T.Mesh(geo, mats[k]);
      m.castShadow = !small;
      g.add(m);
    });
    const blob = new T.Mesh(new T.PlaneGeometry(2.7, 6.6), new T.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false, opacity: 0.75 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    blob.renderOrder = 2;
    g.add(blob);
    g.scale.setScalar(SC);
    scene.add(g);
    return { d, i, g, u: 1 - i * 0.0105, lap: 0, lane: (i % 2 ? 1 : -1) * 0.17, spd: (1 / 15.5) * (0.9 + 0.1 * d.strength), lapStart: 0, ers: 0.7 };
  });

  let follow = Math.max(0, cars.findIndex((c) => c.d.id === followId));
  let mode: CamMode = "tv";
  let launch = reduce ? 1 : 0;
  let launching = false;
  const LAP_S = 91.5 / 15.5;
  let raceT = 0,
    towerT = 0,
    radioT = 7,
    lastOv = -99;
  let best = { t: Infinity, i: -1 };
  let ordered = cars.slice();
  const RADIO = [
    "Box, box. Box this lap.",
    "Gap behind is one point two. Push now.",
    "Tyres are holding. Keep this pace.",
    "Copy. Switching to plan B.",
    "Mode push, mode push.",
    "Car ahead is struggling in sector two.",
    "Good job. Bring it home.",
    "DRS enabled. Go, go.",
  ];

  function updateTower() {
    ordered = cars.slice().sort((a, b) => b.u - a.u);
    const lead = ordered[0];
    const rows = ordered.map((c, p) => {
      const prev = c.pos;
      c.pos = p;
      const delta: -1 | 0 | 1 = prev === undefined || prev === p || launch < 0.9 ? 0 : p < prev ? 1 : -1;
      if (delta === 1 && (p < 5 || c.i === follow) && raceT - lastOv > 7) {
        lastOv = raceT;
        const v = ordered[p + 1];
        ev.onBanner?.("overtake", `${c.d.code} passes ${v ? v.d.code : ""} for P${p + 1}`, c.d.id);
      }
      return { id: c.d.id, gap: p === 0 ? "Leader" : `+${((lead.u - c.u) * 91.5).toFixed(3)}`, delta };
    });
    ev.onTower?.(rows, Math.max(1, lead.lap));
  }
  function onLap(c: Car) {
    const t = (raceT - c.lapStart) * LAP_S;
    c.lapStart = raceT;
    if (c.lap < 2 || t < 60) return;
    if (t < best.t) {
      best = { t, i: c.i };
      const m = Math.floor(t / 60);
      ev.onBanner?.("fastest", `${c.d.code} ${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`, c.d.id);
    }
  }

  // cameras
  type Shot = { k: string; tgt: Car; t: number; dur: number; snap: boolean; id: number; fov: number; fixed?: T.Vector3; miss?: number; passed?: boolean };
  let shot: Shot | null = null;
  const SHOTS: Record<string, string> = { trackside: "Trackside", low: "Kerb cam", heli: "Helicopter", chase: "Chase", tcam: "T-cam", pan: "Pan" };
  const tmp = V(),
    want = V(),
    lookT = V(),
    look = V(),
    camPos = V(10, 9, 12);
  function newShot() {
    const tgt = Math.random() < 0.65 ? cars[follow] : ordered[(Math.random() * 3) | 0];
    const pool = ["trackside", "trackside", "low", "heli", "chase", "tcam", "pan"];
    const k = pool[(Math.random() * pool.length) | 0];
    const s: Shot = { k, tgt, t: 0, dur: 4 + Math.random() * 3.5, snap: true, id: 1 + ((Math.random() * 18) | 0), fov: 30 };
    if (k === "trackside" || k === "low" || k === "pan") {
      const u = mod1(tgt.u + (k === "low" ? 0.014 : k === "pan" ? 0.004 : 0.018));
      const p = curve.getPointAt(u),
        tg = curve.getTangentAt(u),
        side = Math.random() < 0.5 ? 1 : -1;
      const sv = V(-tg.z, 0, tg.x).normalize();
      s.fixed = p
        .clone()
        .addScaledVector(sv, side * (k === "low" ? HW + 0.2 : k === "pan" ? HW + 1.8 : HW + 1.5))
        .add(V(0, k === "low" ? 0.05 : k === "pan" ? 0.5 : 0.34, 0));
    }
    s.fov = ({ trackside: 20, low: 34, heli: 30, chase: 46, tcam: 66, pan: 28 } as Record<string, number>)[k];
    shot = s;
    ev.onShot?.(`CAM ${String(s.id).padStart(2, "0")} · ${SHOTS[k]} · ${tgt.d.code}`);
  }
  let theta = 0.65,
    phi = 0.86,
    radius = 23,
    tTheta = theta,
    tPhi = phi,
    mx = 0,
    my = 0;
  let drag: { x: number; y: number; t: number; p: number } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, t: tTheta, p: tPhi };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5 && mode !== "orbit") setCam("orbit");
    tTheta = drag.t - dx * 0.006;
    tPhi = Math.min(1.32, Math.max(0.42, drag.p - dy * 0.004));
  };
  const onUp = () => (drag = null);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function setCam(m: CamMode) {
    mode = m;
    if (m === "tv") newShot();
    else ev.onShot?.(m === "board" ? `ONBOARD · ${cars[follow].d.code}` : "ORBIT · FREE CAMERA");
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!small) composer.addPass(new UnrealBloomPass(new T.Vector2(512, 512), 0.28, 0.45, 0.94));
  composer.addPass(new OutputPass());
  function size() {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(PR);
    composer.setSize(w, h);
    camera.aspect = w / h;
    radius = w < 700 ? 30 : w < 1100 ? 26 : 23;
    camera.updateProjectionMatrix();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  let visible = true;
  const io = new IntersectionObserver((es) => es.forEach((e) => (visible = e.isIntersecting)), { threshold: 0 });
  io.observe(host);
  const GEARS = [0, 95, 135, 170, 205, 240, 275, 305, 999];
  let last = performance.now(),
    raf = 0,
    shake = 0,
    telT = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    if (launching && launch < 1) launch = Math.min(1, launch + dt / 3);
    const L = launch * launch;
    raceT += dt * L;
    cars.forEach((c, k) => {
      const jit = 1 + Math.sin(now / 900 + k * 1.7) * 0.035 + Math.sin(now / 2300 + k * 4.1) * 0.02;
      const nu = c.u + c.spd * jit * dt * L * (0.5 + 0.62 * sfAt(c.u));
      if (Math.floor(nu) > Math.floor(c.u)) {
        c.lap++;
        onLap(c);
      }
      c.u = nu;
      const u = mod1(c.u);
      const p = curve.getPointAt(u),
        t = curve.getTangentAt(u),
        s = tmp.set(-t.z, 0, t.x).normalize();
      c.g.position.copy(p).addScaledVector(s, c.lane * (1 - Math.min(1, L) * 0.75));
      c.g.lookAt(c.g.position.x + t.x, c.g.position.y + t.y, c.g.position.z + t.z);
    });
    towerT += dt;
    if (towerT > 0.35) {
      towerT = 0;
      updateTower();
    }
    if (L > 0.9) {
      radioT -= dt;
      if (radioT < 0) {
        radioT = 18 + Math.random() * 10;
        ev.onBanner?.("radio", RADIO[(Math.random() * RADIO.length) | 0], cars[follow].d.id);
      }
    }

    // telemetry for the followed car (HUD and engine sound)
    const me = cars[follow];
    const sf = sfAt(me.u) * Math.min(1, L);
    telT += dt;
    if (telT > 0.05) {
      telT = 0;
      const speed = Math.max(0, Math.round(72 * Math.min(1, L) + sf * 262 + Math.sin(now / 170) * 2));
      let gr = 1;
      while (speed >= GEARS[gr] && gr < 8) gr++;
      const rpm = Math.min(1, Math.max(0, (speed - GEARS[gr - 1]) / (GEARS[gr] - GEARS[gr - 1])));
      const p = ordered.indexOf(me),
        ahead = ordered[p - 1],
        gap = ahead ? (ahead.u - me.u) * 91.5 : 99;
      me.ers = Math.min(1, Math.max(0.05, me.ers + (sf > 0.9 ? -0.05 * 0.07 : 0.05 * 0.05)));
      ev.onTelemetry?.({
        speed,
        gear: launch < 0.02 ? "N" : gr,
        rpm,
        drs: sf > 0.9 && gap < 1.2,
        ers: me.ers,
        position: p + 1,
        lap: Math.max(1, me.lap),
        throttle: launch < 0.02 ? 0.05 : Math.min(1, 0.25 + sf * 0.85),
      });
    }

    // cameras
    shake = Math.max(0, shake - dt * 1.6);
    let fov = camera.fov,
      snap = false,
      lerpP = 0.08,
      lerpL = 0.1;
    if (mode === "tv") {
      if (!shot) newShot();
      const s = shot!;
      s.t += dt;
      if (s.t > s.dur) newShot();
      const c = shot!;
      const u = mod1(c.tgt.u);
      const p = c.tgt.g.position,
        t = curve.getTangentAt(u),
        sv = V(-t.z, 0, t.x).normalize();
      if (c.fixed) {
        want.copy(c.fixed);
        lookT.copy(p).add(V(0, 0.03, 0));
        lerpP = 1;
        lerpL = c.k === "trackside" ? 0.35 : 0.25;
        const dist = p.distanceTo(c.fixed);
        if (!c.passed && dist < 1.4 && L > 0.5) {
          c.passed = true;
          ev.onPassBy?.(Math.max(0, 1 - dist / 1.4));
        }
        if (dist > 4.5 && c.t > 1.2) newShot();
      } else if (c.k === "heli") {
        want.copy(p).addScaledVector(t, -2.2).addScaledVector(sv, 1.1).add(V(0, 2.4, 0));
        lookT.copy(p).addScaledVector(t, 0.5);
        lerpP = 0.06;
      } else if (c.k === "chase") {
        want.copy(p).addScaledVector(t, -0.72).add(V(0, 0.15, 0));
        lookT.copy(p).addScaledVector(t, 1.4).add(V(0, 0.02, 0));
        lerpP = 0.25;
        lerpL = 0.3;
      } else {
        want.copy(p).addScaledVector(t, -0.05).add(V(0, 0.1, 0));
        lookT.copy(p).addScaledVector(t, 2).add(V(0, 0.05, 0));
        lerpP = 1;
        lerpL = 1;
      }
      fov = c.fov;
      snap = c.snap;
      c.snap = false;
    } else if (mode === "board") {
      const u = mod1(me.u);
      const p = me.g.position,
        t = curve.getTangentAt(u);
      want.copy(p).addScaledVector(t, -0.34).add(V(0, 0.115, 0));
      lookT.copy(p).addScaledVector(t, 2).add(V(0, 0.03, 0));
      lerpP = 0.45;
      lerpL = 0.5;
      fov = 60;
      shake += sf * sf * 0.35 * dt * 10;
    } else {
      if (!drag) tTheta += dt * 0.045;
      theta += (tTheta - theta) * 0.07;
      phi += (tPhi - phi) * 0.07;
      want.set(Math.sin(theta) * Math.sin(phi) * radius, Math.cos(phi) * radius, Math.cos(theta) * Math.sin(phi) * radius);
      want.x += mx * 1.2;
      want.y -= my * 0.8;
      const wide = host.clientWidth > 980;
      lookT.set(wide ? -3.2 : 0, 0, wide ? 1.2 : 2.5);
      fov = 30;
      lerpP = 0.06;
      lerpL = 0.08;
    }
    if (snap) {
      camPos.copy(want);
      look.copy(lookT);
      camera.fov = fov;
    } else {
      camPos.lerp(want, lerpP);
      look.lerp(lookT, lerpL);
      camera.fov += (fov - camera.fov) * 0.1;
    }
    camera.updateProjectionMatrix();
    camera.position.copy(camPos);
    camera.lookAt(look);
    if (mode === "tv" && shot) {
      tmp.copy(shot.tgt.g.position).project(camera);
      const off = Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05 || tmp.z > 1;
      shot.miss = off ? (shot.miss ?? 0) + dt : 0;
      if (shot.miss > 0.9) newShot();
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * 0.03 * Math.min(1, shake);
      camera.position.y += (Math.random() - 0.5) * 0.025 * Math.min(1, shake);
    }
    composer.render();

    if (mode === "orbit" && ev.onTags) {
      const w = host.clientWidth,
        h = host.clientHeight;
      ev.onTags(
        cars.map((c) => {
          tmp.copy(c.g.position);
          tmp.y += 0.2;
          tmp.project(camera);
          return {
            id: c.d.id,
            x: (tmp.x * 0.5 + 0.5) * w,
            y: (-tmp.y * 0.5 + 0.5) * h,
            visible: tmp.z < 1 && ((c.pos ?? 99) < 5 || c.i === follow),
          };
        }),
      );
    }
  }
  raf = requestAnimationFrame(frame);
  setCam("tv");

  return {
    setCam,
    setFollow(id) {
      const k = cars.findIndex((c) => c.d.id === id);
      if (k >= 0) follow = k;
      if (mode === "tv") newShot();
      else if (mode === "board") ev.onShot?.(`ONBOARD · ${cars[follow].d.code}`);
    },
    launch() {
      launching = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      scene.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.InstancedMesh) {
          o.geometry.dispose();
          const m = o.material as T.Material | T.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      Object.values(tex).forEach((t) => t.dispose());
      pm.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
