import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const [src, out, ratioArg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
const DROP = ['mercedes_decals', 'mercedes_number_63', 'sw_decals'];
const base = n => n.replace(/\.\d+$/, '');
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const n = base(p.getMaterial()?.getName() ?? '');
  if (DROP.includes(n)) { mesh.removePrimitive(p); p.dispose(); }
}
const img = (f, mime) => ({ data: fs.readFileSync('tex/' + f), mime });
const RE = {
  mercedes_paint: ['livery_body.png', 'image/png', 'livery_body'],
  mercedes_paint2: ['livery_halo.png', 'image/png', 'livery_halo'],
  sidewall: ['tyre.jpg', 'image/jpeg', 'tyre_sidewall'],
  tread_medium: ['tyre.jpg', 'image/jpeg', 'tyre_tread'],
  mercedes_detail: ['details.jpg', 'image/jpeg', 'details'],
  generics: ['generic.jpg', 'image/jpeg', 'generics'],
  mercedes_wheel_hub: ['wheel.jpg', 'image/jpeg', 'wheel_hub'],
  mercedes_sw: ['steering.jpg', 'image/jpeg', 'steering_wheel'],
  gp21_cinture: ['belts.jpg', 'image/jpeg', 'belts'],
};
for (const m of root.listMaterials()) {
  const n = base(m.getName());
  const r = RE[n];
  if (r) {
    const t = doc.createTexture(r[2]).setImage(img(r[0]).data).setMimeType(r[1]).setURI(r[2] + (r[1] === 'image/png' ? '.png' : '.jpg'));
    m.setBaseColorTexture(t);
    m.setName(r[2]);
    if (n.startsWith('mercedes_paint')) m.setExtras({ livery: true });
  } else m.setName(n.replace(/^mercedes_/, ''));
  m.setNormalTexture(null);
}
for (const t of root.listTextures()) { t.setName(t.getName().replace(/mercedes/gi, 'car')); if (t.getURI()) t.setURI(t.getURI().replace(/mercedes/gi, 'car')); }
for (const n of root.listNodes()) n.setName('pitwall_car');
for (const m of root.listMeshes()) m.setName('pitwall_car');
const ratio = Number(ratioArg ?? 0.4);
await doc.transform(prune(), dedup(), weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0008 })] : []), prune(), reorder({ encoder: MeshoptEncoder }), quantize());
// drop the now-unused big textures (stars, Pirelli)
for (const t of root.listTextures()) if (t.listParents().length <= 1) t.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
let tris = 0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) tris += p.getIndices().getCount() / 3;
await io.write(out, doc);
console.log(out, 'tris', Math.round(tris), 'textures', root.listTextures().map(t => t.getName()).join(','), (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
