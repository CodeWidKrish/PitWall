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

export interface CarModel {
  instance: (primary: string, accent: string) => T.Group;
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
        return g;
      },
    };
  } catch {
    return null;
  }
}
