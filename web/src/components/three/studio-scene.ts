/**
 * The car studio: the realistic car on a turntable under studio lights. Drag to walk
 * around it, switch liveries, tyre compounds, lighting and camera angles, and follow
 * pins that explain the main parts of a modern F1 car.
 */
import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadCarModel } from "@/components/three/car-model";

export type Lighting = "studio" | "night" | "sunset";
export type View = "hero" | "front" | "side" | "top" | "rear" | "driver";

export interface Hotspot {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface StudioController {
  setLivery: (primary: string, accent: string) => void;
  setTyre: (hex: string) => void;
  setLighting: (l: Lighting) => void;
  setView: (v: View) => void;
  dispose: () => void;
}

// Where each labelled part sits, as fractions of the car's bounding box (x across, y up, z nose).
const SPOTS: Record<string, [number, number, number]> = {
  wing: [0.5, 0.12, 0.98],
  halo: [0.5, 0.92, 0.62],
  sidepod: [0.9, 0.45, 0.5],
  floor: [0.5, 0.02, 0.4],
  rear: [0.5, 0.98, 0.03],
  tyre: [0.98, 0.5, 0.82],
};

const VIEWS: Record<View, { theta: number; phi: number; r: number }> = {
  hero: { theta: 0.85, phi: 1.2, r: 8.2 },
  front: { theta: 0, phi: 1.35, r: 7.4 },
  side: { theta: Math.PI / 2, phi: 1.45, r: 7.8 },
  top: { theta: 0.4, phi: 0.25, r: 8.6 },
  rear: { theta: Math.PI - 0.6, phi: 1.25, r: 7.8 },
  driver: { theta: 0.75, phi: 1.05, r: 2.4 },
};

export async function createStudio(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  primary: string,
  accent: string,
  onSpots: (s: Hotspot[]) => void,
): Promise<StudioController | null> {
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  const small = innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = T.NeutralToneMapping; // true-to-life colours with soft highlights
  renderer.toneMappingExposure = 1.0;
  // Soft shadows cost extra shader programs and a second pass: phones go without.
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  const pm = new T.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = env;
  const camera = new T.PerspectiveCamera(28, 1, 0.1, 100);

  // floor: soft reflective ground with a contact shadow
  // Fade the floor out to the edges so it melts into the background.
  const fadeCanvas = document.createElement("canvas");
  fadeCanvas.width = fadeCanvas.height = 256;
  {
    const x = fadeCanvas.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.45, "#fff");
    g.addColorStop(1, "#000");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  }
  const fade = new T.CanvasTexture(fadeCanvas);
  const floor = new T.Mesh(
    new T.CircleGeometry(9, 96),
    new T.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.32, metalness: 0.55, alphaMap: fade, transparent: true }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new T.Mesh(
    new T.RingGeometry(3.6, 3.64, 128),
    new T.MeshBasicMaterial({ color: 0x8f45ff, transparent: true, opacity: 0.55 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  const key = new T.SpotLight(0xffffff, 140, 30, 0.55, 0.6, 1.4);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  const rim = new T.SpotLight(0x9fb4ff, 90, 30, 0.6, 0.7, 1.4);
  rim.position.set(-5, 4, -6);
  const fill = new T.HemisphereLight(0xffffff, 0x101015, 0.6);
  scene.add(key, rim, fill, key.target, rim.target);

  const LIGHTS: Record<Lighting, { env: number; key: number; keyCol: number; rim: number; rimCol: number; fill: number; ring: number }> = {
    studio: { env: 1.0, key: 140, keyCol: 0xffffff, rim: 90, rimCol: 0x9fb4ff, fill: 0.6, ring: 0x8f45ff },
    night: { env: 0.35, key: 70, keyCol: 0xbcd0ff, rim: 160, rimCol: 0x8f45ff, fill: 0.15, ring: 0x8f45ff },
    sunset: { env: 0.7, key: 160, keyCol: 0xffb070, rim: 110, rimCol: 0xff5a7a, fill: 0.35, ring: 0xff8a3d },
  };

  const model = await loadCarModel(small);
  if (!model) {
    renderer.dispose();
    return null;
  }
  let car = model.instance(primary, accent);
  car.traverse((o) => {
    if (o instanceof T.Mesh) o.castShadow = true;
  });
  scene.add(car);
  const box = new T.Box3().setFromObject(car);
  const size = box.getSize(new T.Vector3());
  const centre = box.getCenter(new T.Vector3());

  // Find the four wheels from the tyre meshes, and give each a compound band.
  const tyreMat = new T.MeshBasicMaterial({ color: 0xff3b3b });
  const bands = new T.Group();
  {
    const pts: T.Vector3[] = [];
    const v = new T.Vector3();
    car.updateMatrixWorld(true);
    car.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const name = (o.material as T.Material).name ?? "";
      if (!name.startsWith("tyre")) return;
      const pos = o.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
    const quads = [0, 1, 2, 3].map(() => [] as T.Vector3[]);
    pts.forEach((p) => quads[(p.x > centre.x ? 1 : 0) + (p.z > centre.z ? 2 : 0)].push(p));
    quads.forEach((q) => {
      if (q.length < 20) return;
      const b = new T.Box3().setFromPoints(q);
      const c = b.getCenter(new T.Vector3());
      const radius = (b.max.y - b.min.y) / 2;
      const outer = c.x > centre.x ? b.max.x + 0.004 : b.min.x - 0.004;
      const torus = new T.Mesh(new T.TorusGeometry(radius * 0.82, radius * 0.035, 8, 64), tyreMat);
      torus.position.set(outer, c.y, c.z);
      torus.rotation.y = Math.PI / 2;
      bands.add(torus);
    });
  }
  car.add(bands);

  let theta = VIEWS.hero.theta,
    phi = VIEWS.hero.phi,
    r = VIEWS.hero.r;
  let tTheta = theta,
    tPhi = phi,
    tR = r,
    auto = true,
    drag: { x: number; y: number; t: number; p: number } | null = null;
  const lookCar = centre.clone();
  lookCar.y = size.y * 0.35;
  let driverAt = lookCar.clone();
  car.traverse((o) => {
    if (o.userData.driver) driverAt = o.getWorldPosition(new T.Vector3());
  });
  const look = lookCar.clone();
  let lookTarget = lookCar;

  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, t: tTheta, p: tPhi };
    auto = false;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    tTheta = drag.t - (e.clientX - drag.x) * 0.008;
    tPhi = Math.min(1.5, Math.max(0.2, drag.p - (e.clientY - drag.y) * 0.005));
  };
  const up = () => {
    drag = null;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  let hostW = host.clientWidth,
    hostH = host.clientHeight;
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    hostW = w;
    hostH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
  io.observe(host);

  await renderer.compileAsync(scene, camera).catch(() => {});
  // One render now, while the section is still arriving, so any remaining shader work
  // happens here rather than in the first visible frame.
  renderer.render(scene, camera);
  let lastSpots = "",
    tick = 0;

  const tmp = new T.Vector3();
  let raf = 0,
    last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    if (auto && !drag) tTheta += dt * 0.18;
    theta += (tTheta - theta) * 0.06;
    phi += (tPhi - phi) * 0.06;
    r += (tR - r) * 0.06;
    look.lerp(lookTarget, 0.06);
    camera.position.set(
      look.x + Math.sin(theta) * Math.sin(phi) * r,
      look.y + Math.cos(phi) * r,
      look.z + Math.cos(theta) * Math.sin(phi) * r,
    );
    camera.lookAt(look);
    renderer.render(scene, camera);
    // Move the part pins at most every other frame, and only when they have moved a pixel:
    // each update re-renders the studio's controls.
    if (small && ++tick % 2) return;
    const w = hostW,
      h = hostH;
    const spots = Object.entries(SPOTS).map(([id, [fx, fy, fz]]) => {
      tmp.set(box.min.x + size.x * fx, box.min.y + size.y * fy, box.min.z + size.z * fz);
      const facing = tmp.clone().sub(centre).normalize().dot(camera.position.clone().sub(centre).normalize());
      tmp.project(camera);
      return {
        id,
        x: Math.round((tmp.x * 0.5 + 0.5) * w),
        y: Math.round((-tmp.y * 0.5 + 0.5) * h),
        visible: tmp.z < 1 && facing > -0.25,
      };
    });
    const sig = spots.map((p) => `${p.x},${p.y},${p.visible ? 1 : 0}`).join(";");
    if (sig !== lastSpots) {
      lastSpots = sig;
      onSpots(spots);
    }
  };
  raf = requestAnimationFrame(frame);

  const ctl: StudioController = {
    setLivery(p, a) {
      const next = model.instance(p, a);
      next.traverse((o) => {
        if (o instanceof T.Mesh) o.castShadow = true;
      });
      next.add(bands);
      scene.remove(car);
      car = next;
      scene.add(car);
    },
    setTyre(hex) {
      tyreMat.color.set(hex);
    },
    setLighting(l) {
      const L = LIGHTS[l];
      scene.environmentIntensity = L.env;
      key.intensity = L.key;
      key.color.setHex(L.keyCol);
      rim.intensity = L.rim;
      rim.color.setHex(L.rimCol);
      fill.intensity = L.fill;
      (ring.material as T.MeshBasicMaterial).color.setHex(L.ring);
    },
    setView(v) {
      auto = v === "hero";
      const target = VIEWS[v];
      // turn the short way round
      const k = Math.round((tTheta - target.theta) / (Math.PI * 2));
      tTheta = target.theta + k * Math.PI * 2;
      tPhi = target.phi;
      tR = target.r * (host.clientWidth < 700 ? 1.35 : 1);
      lookTarget = v === "driver" ? driverAt : lookCar;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      env.dispose();
      pm.dispose();
      renderer.dispose();
    },
  };
  ctl.setView("hero");
  return ctl;
}
