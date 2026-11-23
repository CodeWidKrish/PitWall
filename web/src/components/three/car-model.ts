/**
 * The realistic car: a detailed modern F1 car model, cleaned of every sponsor
 * and team logo and repainted in code. The body texture is a mask (red channel =
 * main colour, green = accent stripes, black = a darker shade of the main colour), so any team's colours can
 * be applied with one shared model.
 *
 * The file is not in the public repository (see README credits); if it is
 * missing, the scene keeps its code-built cars.
 */
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// In production the model is served from private storage (Vercel Blob), set at build time;
// locally it is read from public/models, which git ignores.
export const CAR_MODEL_URL = process.env.NEXT_PUBLIC_CAR_MODEL_URL || "/models/pitwall-car.glb";
const LENGTH_M = 5.39;

export interface Wheel {
  centre: T.Vector3; // in the car's own space (metres)
  radius: number;
  outer: number; // x of the outer sidewall face
  front: boolean;
}

export interface CarModel {
  instance: (primary: string, accent: string) => T.Group;
  wheels: Wheel[];
}

/** Boxes of all meshes whose material name starts with `prefix`, in `root`'s space. */
function partBox(root: T.Object3D, prefix: string) {
  root.updateMatrixWorld(true);
  const box = new T.Box3();
  const v = new T.Vector3();
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const name = (o.material as T.Material).name ?? "";
    if (!name.startsWith(prefix)) return;
    const pos = o.geometry.attributes.position as T.BufferAttribute;
    const m = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += 2) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
  });
  return box;
}

/** The four wheels, found from the tyre meshes split into quadrants. */
function findWheels(root: T.Object3D): Wheel[] {
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();
  const all = new T.Box3().setFromObject(root).applyMatrix4(inv);
  const c = all.getCenter(new T.Vector3());
  const quads = [0, 1, 2, 3].map(() => new T.Box3());
  const v = new T.Vector3();
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    if (!((o.material as T.Material).name ?? "").startsWith("tyre")) return;
    const pos = o.geometry.attributes.position as T.BufferAttribute;
    const m = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      quads[(v.x > c.x ? 1 : 0) + (v.z > c.z ? 2 : 0)].expandByPoint(v);
    }
  });
  return quads
    .filter((b) => !b.isEmpty())
    .map((b) => {
      const centre = b.getCenter(new T.Vector3());
      return {
        centre,
        radius: (b.max.y - b.min.y) / 2,
        outer: centre.x > c.x ? b.max.x : b.min.x,
        front: centre.z > c.z,
      };
    });
}

/** A driver's helmet, visor and neck support, sized for a real head (metres). */
function makeDriver(primary: string, accent: string) {
  const g = new T.Group();
  const shellMat = new T.MeshPhysicalMaterial({ color: accent, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
  const stripeMat = new T.MeshPhysicalMaterial({ color: primary, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const visorMat = new T.MeshPhysicalMaterial({
    color: 0x0a0b10,
    roughness: 0.05,
    metalness: 0.4,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [250, 600],
  });
  const shell = new T.Mesh(new T.SphereGeometry(0.135, 40, 28), shellMat);
  shell.scale.set(1, 1.02, 1.14);
  const visor = new T.Mesh(new T.SphereGeometry(0.1375, 40, 12, Math.PI / 2 - 1.05, 2.1, 1.18, 0.5), visorMat);
  visor.scale.copy(shell.scale);
  const stripe = new T.Mesh(new T.TorusGeometry(0.1372, 0.016, 8, 48, Math.PI), stripeMat);
  stripe.rotation.y = Math.PI / 2;
  stripe.scale.set(1, 1.02, 1.14);
  const hans = new T.Mesh(new T.CylinderGeometry(0.11, 0.15, 0.08, 24), new T.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }));
  hans.position.y = -0.15;
  g.add(shell, visor, stripe, hans);
  g.traverse((o) => {
    if (o instanceof T.Mesh) o.castShadow = true;
  });
  return g;
}

function liveryMaterial(base: T.MeshStandardMaterial, primary: string, accent: string) {
  const mask = base.map;
  if (mask) mask.colorSpace = T.NoColorSpace;
  const m = new T.MeshPhysicalMaterial({
    map: mask,
    roughness: 0.32,
    metalness: 0.35,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
  const uniforms = {
    uPrimary: { value: new T.Color(primary) },
    uAccent: { value: new T.Color(accent) },
    uDark: { value: new T.Color("#0c0d10") },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uPrimary;\nuniform vec3 uAccent;\nuniform vec3 uDark;",
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec4 livery = texture2D( map, vMapUv );
          vec3 paintCol = mix( uPrimary * 0.38 + uDark * 0.5, uPrimary, livery.r );
          paintCol = mix( paintCol, mix( uPrimary, uAccent, 0.55 ), livery.g ); // stripes: a lighter tint of the team colour
          diffuseColor.rgb *= paintCol;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => "pitwall-livery";
  return m;
}

/** Turn the model so its nose points along +z, wheels on y = 0, centred. */
function normalise(root: T.Object3D) {
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root);
  const size = box.getSize(new T.Vector3());
  const wrap = new T.Group();
  wrap.add(root);
  // Long axis onto z.
  if (size.x > size.z) root.rotation.y += Math.PI / 2;
  wrap.updateMatrixWorld(true);
  // The rear wing is the tallest thing at either end: find which end is higher.
  const v = new T.Vector3();
  let frontMax = -Infinity,
    rearMax = -Infinity;
  const b2 = new T.Box3().setFromObject(wrap);
  const len = b2.max.z - b2.min.z;
  wrap.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const pos = o.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const t = (v.z - b2.min.z) / len;
      if (t > 0.9) frontMax = Math.max(frontMax, v.y);
      else if (t < 0.1) rearMax = Math.max(rearMax, v.y);
    }
  });
  // The high end (rear wing) belongs at -z.
  if (frontMax > rearMax) root.rotation.y += Math.PI;
  wrap.updateMatrixWorld(true);
  const b3 = new T.Box3().setFromObject(wrap);
  const c = b3.getCenter(new T.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= b3.min.y;
  const s = LENGTH_M / (b3.max.z - b3.min.z);
  wrap.scale.setScalar(s);
  return wrap;
}

export async function loadCarModel(small: boolean): Promise<CarModel | null> {
  // Respect data saver: keep the lightweight code-built cars.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return null;
  try {
    const head = await fetch(CAR_MODEL_URL, { method: "HEAD" });
    if (!head.ok) return null;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(CAR_MODEL_URL);
    const base = normalise(gltf.scene);
    const wheels = findWheels(base);
    // The driver's head sits above the seat belts, just behind their centre.
    const belts = partBox(base, "belts");
    const seat = belts.isEmpty() ? null : belts.getCenter(new T.Vector3());
    const headY = belts.isEmpty() ? 0 : belts.max.y + 0.11;
    base.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = !small;
        o.receiveShadow = false;
        const mat = o.material as T.MeshStandardMaterial;
        if (!mat.userData?.livery && mat.name !== "livery_body" && mat.name !== "livery_halo") {
          mat.envMapIntensity = 0.9;
        }
      }
    });
    return {
      instance(primary, accent) {
        const g = base.clone(true);
        g.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          const mat = o.material as T.MeshStandardMaterial;
          if (mat.userData?.livery || mat.name.startsWith("livery")) o.material = liveryMaterial(mat, primary, accent);
        });
        if (seat) {
          const driver = makeDriver(primary, accent === "#16181c" ? "#f4f5f7" : accent);
          driver.position.set(seat.x, headY, seat.z - 0.06);
          driver.userData.driver = true;
          g.add(driver);
        }
        return g;
      },
      wheels,
    };
  } catch {
    return null;
  }
}
