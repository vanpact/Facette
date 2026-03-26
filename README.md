# Facette

Perceptual color palette generation. Give it a few seed colors and a target size, and it produces a palette where every color is visually distinct and belongs to the same chromatic family.

## How it works

Facette treats palette generation as a physics simulation: colors are particles on the convex hull of your seeds in OKLab color space, repelling each other until they reach maximum separation. A coordinate warp contracts the low-chroma region so particles naturally avoid muddy grays — unless your seeds are muted, in which case the palette stays muted too.

The algorithm handles everything automatically: 2 seeds produce a gradient, 3+ seeds define a surface, and the convex hull geometry adapts to any configuration — vivid, muted, narrow hue range, or full spectrum.

## Installation

```bash
npm install facette
```

## Usage

```ts
import { generatePalette } from 'facette';

const result = generatePalette(
  ['#e63946', '#457b9d', '#1d3557'],  // seed colors
  8                                     // palette size
);

console.log(result.colors);
// ['#e63946', '#457b9d', '#1d3557', '#7b2d3e', '#2e6a85', ...]
```

### Options

```ts
const result = generatePalette(seeds, 8, {
  vividness: 0.06,  // 0 = auto (default), range [0.005, 0.10]
});
```

The `vividness` parameter controls how aggressively the algorithm avoids low-chroma colors. Higher values push the palette toward more saturated colors. At `0` (default), it adapts automatically based on how vivid your seeds are.

### Debug / visualization API

For inspecting the optimization process:

```ts
import { createPaletteStepper } from 'facette';

const stepper = createPaletteStepper(['#e63946', '#457b9d', '#1d3557'], 8);

// Step through the optimization frame by frame
for (const frame of stepper.frames()) {
  console.log(`Iteration ${frame.iteration}: energy=${frame.energy.toFixed(4)}, minDeltaE=${frame.minDeltaE.toFixed(4)}`);
}

// Or get everything at once
const trace = stepper.run();
console.log(trace.finalColors);       // hex strings
console.log(trace.frames.length);     // number of iterations
console.log(trace.geometry.kind);     // 'line' or 'hull'
```

## Debug Dashboard

The repo includes a web-based debug dashboard for visualizing the algorithm:

```bash
git clone <repo-url>
cd Facette
pnpm install
pnpm turbo dev
```

Then open `http://localhost:5173`. The dashboard shows:

- **Dual 3D views** — OKLab (Cartesian) and OKLCh (cylindrical) side by side
- **Optimization playback** — watch particles repel each other frame by frame
- **Warp morph** — toggle smoothly between unwarped and warped OKLab to see how the gray avoidance transform reshapes the space
- **sRGB gamut boundary** — see the shape of displayable colors
- **Point inspector** — click any point to see its OKLab, OKLCh, warped coordinates, and sRGB values
- **Interactive seeds** — add, remove, or change seed colors and regenerate live

## API Reference

### `generatePalette(seeds, size, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `seeds` | `string[]` | Hex colors (e.g. `['#ff0000', '#0000ff']`). Minimum 2, must be distinct. |
| `size` | `number` | Total palette size including seeds. Must be >= seed count. |
| `options.vividness` | `number` | Gray avoidance strength. `0` = auto. Range `[0.005, 0.10]`. |

**Returns** `PaletteResult`:

```ts
{
  colors: string[];       // hex sRGB colors
  seeds: string[];        // input seeds echoed back
  metadata: {
    minDeltaE: number;    // minimum pairwise perceptual distance
    iterations: number;   // optimization steps taken
    clippedCount: number; // colors that needed gamut clipping
  };
}
```

### `createPaletteStepper(seeds, size, options?)`

Same parameters as `generatePalette`. Returns a `PaletteStepper`:

```ts
{
  geometry: Geometry;                      // hull or line segment topology
  seeds: Particle[];                       // classified seed particles
  frames(): Generator<OptimizationFrame>;  // iterate frame by frame
  run(): OptimizationTrace;                // run to completion
}
```

## How the algorithm works (brief)

1. **Parse seeds** — convert hex to OKLab
2. **Detect dimensionality** — SVD determines if seeds are collinear (1D), coplanar (2D), or full 3D
3. **Build geometry** — convex hull (2D/3D) or line segment (1D) from seeds
4. **Warp space** — apply a coordinate transform that contracts the low-chroma region, making gray positions energetically expensive
5. **Initialize particles** — greedy placement weighted by warped surface area
6. **Optimize** — particle repulsion with Riesz energy (exponent ramps from 2 to 6), constrained to the hull surface
7. **Output** — gamut-clip any out-of-range colors, convert to sRGB hex

The full algorithm specification is in [`Specs/Facette_algorithm_v4.4.md`](Specs/Facette_algorithm_v4.4.md).

## License

MIT
