# Clipping Visualization Design

## Problem

The 3D viewer shows palette points at their unclipped OKLab positions, colored with clipped hex values from `trace.finalColors`. There is no way to see where points land after gamut clipping, or which points were clipped. The user needs to visualize the effect of gamut clipping directly in the 3D viewer.

## Requirements

1. **Clipping toggle** snaps point positions in the 3D viewer to their gamut-clipped OKLab coordinates.
2. **Unlifted-only** — the toggle is disabled/hidden when the viewer is in lifted mode (`morphT > 0`). Clipping is an OKLab-space operation and has no meaning in lifted space.
3. **Frame behavior** — toggling clipping on jumps playback to the last frame. Scrubbing to a different frame disables clipping automatically.
4. **Visual distinction** — points that were clipped (moved by gamut mapping) are visually distinguished from in-gamut points when clipping mode is active.
5. **PointInfoPanel** — always shows both clipped and unclipped OKLab/OKLCh/hex values for the selected point, independent of the toggle state.

## Design

### 1. Core: Capture clipped positions in `finalizeColors`

**File:** `packages/core/src/output.ts`

`finalizeColors()` already computes `clipPreserveChroma(pos)` for out-of-gamut points, converts to hex, then discards the intermediate OKLab. Change it to also return the clipped OKLab positions:

- Add `clippedPositions: OKLab[]` to the return type — same length as input `positions[]`.
- In-gamut points: `clippedPositions[i] = positions[i]` (identity).
- Out-of-gamut points: `clippedPositions[i] = gamut.clipPreserveChroma(positions[i])`.

No new computation — just capturing the intermediate result that is currently discarded.

**File:** `packages/core/src/types.ts`

Add `clippedPositions: OKLab[]` to `OptimizationTrace`.

**File:** `packages/core/src/facette.ts` (~line 263)

Destructure `clippedPositions` from `finalizeColors()` and include it in the trace object.

### 2. Store: `showClipping` toggle with frame/morph interlocks

**File:** `apps/web/src/store/viewerSlice.ts`

Add to `ViewerSlice`:
- `showClipping: boolean` (default `false`)
- `toggleClipping: () => void`

`toggleClipping` logic:
- If turning **on**: set `showClipping: true`, jump `currentFrame` to last frame (via `setCurrentFrame`), and if `morphT > 0`, animate to unlifted first (set `morphT: 0`).
- If turning **off**: set `showClipping: false`.

**Auto-disable interlocks** (reactive, in the store or via effects):
- When `currentFrame` changes to anything other than the last frame → set `showClipping: false`.
- When `morphT` leaves 0 (user toggles lift) → set `showClipping: false`.

### 3. Viewer: Position substitution when clipping is active

**File:** `apps/web/src/components/viewers/OKLabViewer.tsx`

When `showClipping` is true, pass `trace.clippedPositions` to `ParticlePoints` as the `positions` prop instead of the morph-interpolated positions. Since clipping forces unlifted mode and last frame, this is simply `trace.clippedPositions`.

The OKLCh viewer follows the same pattern.

### 4. Visual distinction for clipped points

**File:** `apps/web/src/components/viewers/shared/ParticlePoints.tsx`

When `showClipping` is active, points whose index appears in `trace.clippedIndices` receive a visual marker: a second, slightly larger (1.8x radius) wireframe sphere rendered behind the solid sphere, colored semi-transparent white (`#ffffff` at 40% opacity). This creates a visible ring effect without altering the point's palette color.

`ParticlePoints` receives a new optional prop `clippedIndices: Set<number> | null`. When non-null, the component renders the wireframe ring for indices in the set.

### 5. PointInfoPanel: Always show both values

**File:** `apps/web/src/components/info/PointInfoPanel.tsx`

Always display both clipped and unclipped color info for the selected point:
- Read `trace.clippedPositions[selectedIndex]` and `frame.oklabPositions[selectedIndex]`.
- Compare them: if they differ, the point was clipped.
- Show the unclipped OKLab/OKLCh/hex as currently done.
- Below it, show the clipped OKLab/OKLCh/hex with a label like "Clipped:" and a visual indicator (e.g., the clipped color swatch next to the original).
- If the point was not clipped, show a single section or a note like "In gamut" to avoid redundancy.

Note: clipped values are only available for the last frame (since `trace.clippedPositions` is computed from the final optimization result). When viewing earlier frames, omit the clipped section.

### 6. UI: Toggle placement

**File:** `apps/web/src/components/controls/LayerToggles.tsx`

Add "Clipping" to the existing toggles array. When `morphT > 0` (lifted mode), the checkbox is disabled with reduced opacity and a title tooltip explaining it's only available in unlifted mode.

## Data flow summary

```
finalizeColors() → { colors, clippedIndices, clippedPositions }
       ↓
OptimizationTrace.clippedPositions (new field)
       ↓
Store: showClipping toggle (with frame/morph interlocks)
       ↓
OKLabViewer: positions = showClipping ? trace.clippedPositions : morphInterpolated
       ↓
ParticlePoints: clippedIndices prop → ring on clipped points
       ↓
PointInfoPanel: always shows both clipped/unclipped values
```

## Testing

- **Core unit test**: `finalizeColors` returns correct `clippedPositions` — identity for in-gamut, clipped OKLab for out-of-gamut.
- **Store test**: `toggleClipping` jumps to last frame, auto-disables on frame change or morph change.
- **PointInfoPanel test**: Renders both clipped and unclipped values when point is clipped; shows "In gamut" when not.
- **Visual/manual**: Run dev server, generate a palette with out-of-gamut points, toggle clipping, verify points snap to gamut boundary and clipped points show rings.
