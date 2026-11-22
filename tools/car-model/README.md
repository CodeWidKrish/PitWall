# Car model pipeline

Turns the downloaded car model (kept in `assets-private/`, never committed) into the web model the hero uses.

1. `textures.py` builds logo-free textures: a livery mask from the paint textures (red = main colour,
   green = accent, black = darker main colour, with logo islands removed) and tyres without lettering.
   Run with `uv run --no-project --with pillow --with scipy --with numpy python textures.py <textures dir>`.
2. `build.mjs` drops the decal, number and steering-wheel decal meshes, swaps in the clean textures,
   renames everything, simplifies the mesh and writes a Meshopt-compressed GLB.
   Needs `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` and `meshoptimizer`.
   `node build.mjs <source.glb> web/public/models/pitwall-car.glb 0.35`

The output is gitignored (`*.glb`). If it is missing, the site falls back to the code-built cars.
