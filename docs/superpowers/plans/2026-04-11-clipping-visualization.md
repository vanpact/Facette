# Clipping Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visualize gamut clipping in the 3D viewer — toggle to snap points to clipped positions, distinguish clipped points, and always show both clipped/unclipped values in the info panel.

**Architecture:** Extend `finalizeColors()` to capture clipped OKLab positions (already computed, currently discarded). Add a pure `showClipping` toggle in the store, coordinate interlocks via a dedicated hook, and pipe clipped positions through the existing `useMorphInterpolation` hook so both viewers get the behavior without duplication.

**Tech Stack:** TypeScript, React 19, Zustand, React Three Fiber, Vitest

**Spec:** `docs/superpowers/specs/2026-04-11-clipping-visualization-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/output.ts` | Return `clippedPositions` from `finalizeColors` |
| Modify | `packages/core/src/output.test.ts` | Test `clippedPositions` output |
| Modify | `packages/core/src/types.ts` | Add `clippedPositions` to `OptimizationTrace` |
| Modify | `packages/core/src/facette.ts` | Pass `clippedPositions` into trace |
| Modify | `packages/core/src/facette.test.ts` | Assert `clippedPositions` in trace |
| Modify | `apps/web/src/store/viewerSlice.ts` | Add `showClipping` toggle |
| Create | `apps/web/src/hooks/useClippingInterlock.ts` | Cross-slice coordination hook |
| Create | `apps/web/src/__tests__/useClippingInterlock.test.ts` | Interlock behavior tests |
| Modify | `apps/web/src/hooks/useMorphInterpolation.ts` | Return clipped positions when active |
| Modify | `apps/web/src/components/viewers/shared/ParticlePoints.tsx` | Render wireframe rings on clipped points |
| Modify | `apps/web/src/components/info/PointInfoPanel.tsx` | Show both clipped/unclipped values |
| Modify | `apps/web/src/__tests__/PointInfoPanel.test.tsx` | Test clipped value display |
| Modify | `apps/web/src/components/controls/LayerToggles.tsx` | Add Clipping toggle |
| Modify | `apps/web/src/components/layout/DashboardLayout.tsx` | Mount interlock hook |

---

### Task 1: Return clipped positions from `finalizeColors`

**Files:**
- Modify: `packages/core/src/output.test.ts`
- Modify: `packages/core/src/output.ts`

- [ ] **Step 1: Write failing tests for `clippedPositions`**

Add these tests to `packages/core/src/output.test.ts`, inside the existing `describe('finalizeColors', ...)` block, after the last `it(...)`:

```typescript
  it('returns clippedPositions with same length as input', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
      { L: 0.7, a: 0.05, b: 0 },
    ];
    const { clippedPositions } = finalizeColors(positions, gamut);
    expect(clippedPositions).toHaveLength(2);
  });

  it('clippedPositions identity for in-gamut points', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0, b: 0 },
    ];
    const { clippedPositions } = finalizeColors(positions, gamut);
    expect(clippedPositions[0]).toEqual(positions[0]);
  });

  it('clippedPositions differ for out-of-gamut points', () => {
    const positions: OKLab[] = [
      { L: 0.5, a: 0.4, b: 0.4 },
    ];
    const { clippedPositions, clippedIndices } = finalizeColors(positions, gamut);
    expect(clippedIndices).toContain(0);
    // Clipped position must differ from original
    const cp = clippedPositions[0];
    const op = positions[0];
    const moved = cp.L !== op.L || cp.a !== op.a || cp.b !== op.b;
    expect(moved).toBe(true);
    // Clipped chroma must be less than original
    const origChroma = Math.sqrt(op.a * op.a + op.b * op.b);
    const clipChroma = Math.sqrt(cp.a * cp.a + cp.b * cp.b);
    expect(clipChroma).toBeLessThan(origChroma);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/output.test.ts`
Expected: FAIL — `clippedPositions` is not in the return type.

- [ ] **Step 3: Implement — update `finalizeColors` to return `clippedPositions`**

In `packages/core/src/output.ts`, replace the entire `finalizeColors` function (lines 13–33):

```typescript
export function finalizeColors(
  positions: OKLab[],
  gamut: GamutChecker,
): { colors: string[]; clippedIndices: number[]; clippedPositions: OKLab[] } {
  const colors: string[] = [];
  const clippedIndices: number[] = [];
  const clippedPositions: OKLab[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];

    if (gamut.isInGamut(pos)) {
      colors.push(oklabToHex(pos));
      clippedPositions.push(pos);
    } else {
      const clipped = gamut.clipPreserveChroma(pos);
      colors.push(oklabToHex(clipped));
      clippedPositions.push(clipped);
      clippedIndices.push(i);
    }
  }

  return { colors, clippedIndices, clippedPositions };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/output.test.ts`
Expected: All tests PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.ts packages/core/src/output.test.ts
git commit -m "feat(core): return clippedPositions from finalizeColors"
```

---

### Task 2: Add `clippedPositions` to `OptimizationTrace` and wire into `facette.ts`

**Files:**
- Modify: `packages/core/src/types.ts:131-141`
- Modify: `packages/core/src/facette.ts:263-274`
- Modify: `packages/core/src/facette.test.ts`

- [ ] **Step 1: Write failing test for `trace.clippedPositions`**

Add this test to `packages/core/src/facette.test.ts`, inside the existing `describe` block, after the test for `run() returns complete trace with liftConfig` (around line 188):

```typescript
  it('run() returns clippedPositions with same length as finalColors', () => {
    const stepper = createPaletteStepper(['#ff0000', '#0000ff'], 4);
    const trace = stepper.run();
    expect(trace.clippedPositions).toHaveLength(trace.finalColors.length);
    // Each clipped position must be a valid OKLab
    for (const pos of trace.clippedPositions) {
      expect(pos).toHaveProperty('L');
      expect(pos).toHaveProperty('a');
      expect(pos).toHaveProperty('b');
    }
  });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `cd packages/core && npx vitest run src/facette.test.ts`
Expected: FAIL — `clippedPositions` does not exist on trace.

- [ ] **Step 3: Add `clippedPositions` to `OptimizationTrace` type**

In `packages/core/src/types.ts`, add the field after `clippedIndices` (line 136):

```typescript
export interface OptimizationTrace {
  geometry: Geometry;
  seeds: Particle[];
  frames: OptimizationFrame[];
  finalColors: string[];
  clippedIndices: number[];
  clippedPositions: OKLab[];
  liftConfig: SpaceLiftConfig;
  vividness: number;
  spread: number;
  Lc: number;
}
```

- [ ] **Step 4: Wire `clippedPositions` into trace in `facette.ts`**

In `packages/core/src/facette.ts`, update line 263 to destructure the new field, and add it to the trace object (lines 263–274):

```typescript
      const { colors, clippedIndices, clippedPositions } = finalizeColors(oklabPositions, gamut);
      cachedTrace = {
        geometry: displayGeometry,
        seeds: displaySeeds,
        frames: observedFrames.slice(),
        finalColors: colors,
        clippedIndices,
        clippedPositions,
        liftConfig: lift.config,
        vividness: v,
        spread,
        Lc,
      };
```

- [ ] **Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/facette.ts packages/core/src/facette.test.ts
git commit -m "feat(core): add clippedPositions to OptimizationTrace"
```

---

### Task 3: Add `showClipping` toggle to `viewerSlice`

**Files:**
- Modify: `apps/web/src/store/viewerSlice.ts`

- [ ] **Step 1: Add `showClipping` and `toggleClipping` to the slice**

In `apps/web/src/store/viewerSlice.ts`, add the new field and action:

```typescript
import type { StateCreator } from 'zustand';

export interface ViewerSlice {
  showSeeds: boolean;
  showGenerated: boolean;
  showHull: boolean;
  showGamut: boolean;
  showAxes: boolean;
  showClipping: boolean;
  morphT: number;

  toggleSeeds: () => void;
  toggleGenerated: () => void;
  toggleHull: () => void;
  toggleGamut: () => void;
  toggleAxes: () => void;
  toggleClipping: () => void;
  setMorphT: (t: number) => void;
}

export const createViewerSlice: StateCreator<ViewerSlice, [], [], ViewerSlice> = (set) => ({
  showSeeds: true,
  showGenerated: true,
  showHull: true,
  showGamut: false,
  showAxes: true,
  showClipping: false,
  morphT: 0,

  toggleSeeds: () => set((s) => ({ showSeeds: !s.showSeeds })),
  toggleGenerated: () => set((s) => ({ showGenerated: !s.showGenerated })),
  toggleHull: () => set((s) => ({ showHull: !s.showHull })),
  toggleGamut: () => set((s) => ({ showGamut: !s.showGamut })),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleClipping: () => set((s) => ({ showClipping: !s.showClipping })),
  setMorphT: (t) => set({ morphT: t }),
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/store/viewerSlice.ts
git commit -m "feat(web): add showClipping toggle to viewerSlice"
```

---

### Task 4: Create `useClippingInterlock` hook

**Files:**
- Create: `apps/web/src/__tests__/useClippingInterlock.test.ts`
- Create: `apps/web/src/hooks/useClippingInterlock.ts`
- Modify: `apps/web/src/components/layout/DashboardLayout.tsx`

- [ ] **Step 1: Write failing tests for the interlock hook**

Create `apps/web/src/__tests__/useClippingInterlock.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useStore } from '../store';
import { useClippingInterlock } from '../hooks/useClippingInterlock';
import type { OptimizationTrace } from 'facette';

const makeTrace = (frameCount: number): OptimizationTrace => ({
  geometry: { kind: 'line', start: { L: 0, a: 0, b: 0 }, end: { L: 1, a: 0, b: 0 } },
  seeds: [],
  frames: Array.from({ length: frameCount }, (_, i) => ({
    iteration: i,
    particles: [{ kind: 'free-1d' as const, position: { L: 0.5, a: 0, b: 0 }, t: 0.5 }],
    oklabPositions: [{ L: 0.5, a: 0, b: 0 }],
    energy: 0,
    minDeltaE: 0,
    p: 2,
    stepSize: 0.01,
  })),
  finalColors: ['#777777'],
  clippedIndices: [],
  clippedPositions: [{ L: 0.5, a: 0, b: 0 }],
  liftConfig: { rs: 0.04, R: 0.15, gamma: 1 },
  vividness: 2,
  spread: 1.5,
  Lc: 0.5,
});

beforeEach(() => {
  useStore.setState({
    trace: makeTrace(5),
    currentFrame: 0,
    showClipping: false,
    morphT: 0,
  });
});

describe('useClippingInterlock', () => {
  it('jumps to last frame when showClipping is turned on', () => {
    renderHook(() => useClippingInterlock());
    act(() => useStore.getState().toggleClipping());
    expect(useStore.getState().currentFrame).toBe(4);
  });

  it('sets morphT to 0 when showClipping is turned on while lifted', () => {
    useStore.setState({ morphT: 1 });
    renderHook(() => useClippingInterlock());
    act(() => useStore.getState().toggleClipping());
    expect(useStore.getState().morphT).toBe(0);
  });

  it('disables showClipping when currentFrame changes away from last', () => {
    useStore.setState({ currentFrame: 4, showClipping: true });
    renderHook(() => useClippingInterlock());
    act(() => useStore.getState().setCurrentFrame(2));
    expect(useStore.getState().showClipping).toBe(false);
  });

  it('disables showClipping when morphT leaves 0', () => {
    useStore.setState({ currentFrame: 4, showClipping: true });
    renderHook(() => useClippingInterlock());
    act(() => useStore.getState().setMorphT(0.5));
    expect(useStore.getState().showClipping).toBe(false);
  });

  it('does not disable showClipping when on last frame', () => {
    useStore.setState({ currentFrame: 4, showClipping: true });
    renderHook(() => useClippingInterlock());
    // Re-setting to last frame should not disable
    act(() => useStore.getState().setCurrentFrame(4));
    expect(useStore.getState().showClipping).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/__tests__/useClippingInterlock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interlock hook**

Create `apps/web/src/hooks/useClippingInterlock.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function useClippingInterlock(): void {
  const showClipping = useStore((s) => s.showClipping);
  const currentFrame = useStore((s) => s.currentFrame);
  const morphT = useStore((s) => s.morphT);
  const trace = useStore((s) => s.trace);
  const prevShowClipping = useRef(showClipping);

  const lastFrame = trace ? trace.frames.length - 1 : 0;

  // When showClipping turns on: jump to last frame, force unlifted
  useEffect(() => {
    if (showClipping && !prevShowClipping.current) {
      useStore.getState().setCurrentFrame(lastFrame);
      if (useStore.getState().morphT > 0) {
        useStore.getState().setMorphT(0);
      }
    }
    prevShowClipping.current = showClipping;
  }, [showClipping, lastFrame]);

  // When frame moves away from last: disable clipping
  useEffect(() => {
    if (showClipping && currentFrame !== lastFrame) {
      useStore.setState({ showClipping: false });
    }
  }, [currentFrame, showClipping, lastFrame]);

  // When morphT leaves 0: disable clipping
  useEffect(() => {
    if (showClipping && morphT > 0) {
      useStore.setState({ showClipping: false });
    }
  }, [morphT, showClipping]);
}
```

- [ ] **Step 4: Mount the hook in `DashboardLayout`**

In `apps/web/src/components/layout/DashboardLayout.tsx`, add the import and call:

```typescript
import { SeedEditor } from '../controls/SeedEditor';
import { PaletteControls } from '../controls/PaletteControls';
import { PlaybackControls } from '../controls/PlaybackControls';
import { LayerToggles } from '../controls/LayerToggles';
import { OKLabViewer } from '../viewers/OKLabViewer';
import { OKLChViewer } from '../viewers/OKLChViewer';
import { PointInfoPanel } from '../info/PointInfoPanel';
import { EnergyGraph } from '../info/EnergyGraph';
import { PaletteStrip } from '../palette/PaletteStrip';
import { useSyncedCamera } from '../../hooks/useSyncedCamera';
import { useClippingInterlock } from '../../hooks/useClippingInterlock';

export function DashboardLayout() {
  const { leftRef, rightRef } = useSyncedCamera();
  useClippingInterlock();

  return (
    // ... rest unchanged
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/__tests__/useClippingInterlock.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useClippingInterlock.ts apps/web/src/__tests__/useClippingInterlock.test.ts apps/web/src/components/layout/DashboardLayout.tsx
git commit -m "feat(web): add useClippingInterlock hook with frame/morph coordination"
```

---

### Task 5: Extend `useMorphInterpolation` to return clipped positions

**Files:**
- Modify: `apps/web/src/hooks/useMorphInterpolation.ts`

- [ ] **Step 1: Update `useMorphInterpolation` to check `showClipping`**

Replace the contents of `apps/web/src/hooks/useMorphInterpolation.ts`:

```typescript
import { useMemo } from 'react';
import { useStore } from '../store';
import type { OKLab, Particle } from 'facette';

function lerpOKLab(a: OKLab, b: OKLab, t: number): OKLab {
  return {
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function useMorphInterpolation(): {
  particles: Particle[];
  interpolatedPositions: OKLab[];
} | null {
  const trace = useStore((s) => s.trace);
  const currentFrame = useStore((s) => s.currentFrame);
  const morphT = useStore((s) => s.morphT);
  const showClipping = useStore((s) => s.showClipping);

  return useMemo(() => {
    if (!trace || currentFrame >= trace.frames.length) return null;
    const frame = trace.frames[currentFrame];

    if (showClipping && morphT === 0) {
      return { particles: frame.particles, interpolatedPositions: trace.clippedPositions };
    }

    const interpolated = frame.particles.map((p, i) =>
      lerpOKLab(frame.oklabPositions[i], p.position, morphT)
    );
    return { particles: frame.particles, interpolatedPositions: interpolated };
  }, [trace, currentFrame, morphT, showClipping]);
}
```

- [ ] **Step 2: Run all web tests to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useMorphInterpolation.ts
git commit -m "feat(web): return clipped positions from useMorphInterpolation when showClipping active"
```

---

### Task 6: Render wireframe rings on clipped points

**Files:**
- Modify: `apps/web/src/components/viewers/shared/ParticlePoints.tsx`
- Modify: `apps/web/src/components/viewers/OKLabViewer.tsx:49-55`
- Modify: `apps/web/src/components/viewers/OKLChViewer.tsx:31-38`

- [ ] **Step 1: Add `clippedIndices` prop to `ParticlePoints` and render rings**

Replace the contents of `apps/web/src/components/viewers/shared/ParticlePoints.tsx`:

```typescript
import * as THREE from 'three';
import type { OKLab, Particle } from 'facette';
import { useStore } from '../../../store';

interface ParticlePointsProps {
  particles: Particle[];
  positions: OKLab[];
  positionMapper: (pos: OKLab) => [number, number, number];
  colors: string[];
  clippedIndices?: Set<number> | null;
}

export function ParticlePoints({ particles, positions, positionMapper, colors, clippedIndices }: ParticlePointsProps) {
  const selectedIndex = useStore((s) => s.selectedIndex);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const setHoveredIndex = useStore((s) => s.setHoveredIndex);
  const showSeeds = useStore((s) => s.showSeeds);
  const showGenerated = useStore((s) => s.showGenerated);

  return (
    <group>
      {particles.map((p, i) => {
        const isSeed = p.kind.startsWith('pinned');
        if (isSeed && !showSeeds) return null;
        if (!isSeed && !showGenerated) return null;

        const pos = positionMapper(positions[i]);
        const radius = isSeed ? 0.015 : 0.01;
        const isSelected = selectedIndex === i;
        const isClipped = clippedIndices?.has(i) ?? false;

        return (
          <group key={i}>
            {isClipped && (
              <mesh position={pos}>
                <sphereGeometry args={[radius * 1.8, 16, 16]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={0.4}
                  wireframe
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
            <mesh
              position={pos}
              onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); }}
              onPointerEnter={() => setHoveredIndex(i)}
              onPointerLeave={() => setHoveredIndex(null)}
            >
              <sphereGeometry args={[isSelected ? radius * 1.5 : radius, 16, 16]} />
              <meshStandardMaterial
                color={colors[i] ?? '#ffffff'}
                emissive={isSelected ? '#ffffff' : '#000000'}
                emissiveIntensity={isSelected ? 0.3 : 0}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
```

- [ ] **Step 2: Pass `clippedIndices` from `OKLabViewer`**

In `apps/web/src/components/viewers/OKLabViewer.tsx`, update the `ParticlePoints` usage (around line 49). Add `showClipping` from the store and compute the set:

Add after line 23 (`const { isWarped, toggle } = useMorphToggle();`):
```typescript
  const showClipping = useStore((s) => s.showClipping);
```

Replace the `ParticlePoints` JSX (lines 50–55):
```typescript
        {morphData && (
          <ParticlePoints
            particles={morphData.particles}
            positions={morphData.interpolatedPositions}
            positionMapper={posMapper}
            colors={trace?.finalColors ?? []}
            clippedIndices={showClipping && trace ? new Set(trace.clippedIndices) : null}
          />
        )}
```

- [ ] **Step 3: Pass `clippedIndices` from `OKLChViewer`**

In `apps/web/src/components/viewers/OKLChViewer.tsx`, add the same pattern.

Add after line 18 (`const showAxes = useStore((s) => s.showAxes);`):
```typescript
  const showClipping = useStore((s) => s.showClipping);
```

Replace the `ParticlePoints` JSX (lines 32–37):
```typescript
        {morphData && (
          <ParticlePoints
            particles={morphData.particles}
            positions={morphData.interpolatedPositions}
            positionMapper={posMapper}
            colors={trace?.finalColors ?? []}
            clippedIndices={showClipping && trace ? new Set(trace.clippedIndices) : null}
          />
        )}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/viewers/shared/ParticlePoints.tsx apps/web/src/components/viewers/OKLabViewer.tsx apps/web/src/components/viewers/OKLChViewer.tsx
git commit -m "feat(web): render wireframe rings on clipped points in 3D viewers"
```

---

### Task 7: Show clipped values in `PointInfoPanel`

**Files:**
- Modify: `apps/web/src/__tests__/PointInfoPanel.test.tsx`
- Modify: `apps/web/src/components/info/PointInfoPanel.tsx`

- [ ] **Step 1: Write failing tests for clipped value display**

Add to `apps/web/src/__tests__/PointInfoPanel.test.tsx`. First update the trace fixture to include `clippedPositions`, then add tests.

Replace the `trace` constant (lines 7–31) with:

```typescript
const trace: OptimizationTrace = {
  geometry: {
    kind: 'line',
    start: { L: 0.2, a: 0, b: 0 },
    end: { L: 0.8, a: 0, b: 0 },
  },
  seeds: [],
  frames: [
    {
      iteration: 0,
      particles: [{ kind: 'free-1d', position: { L: 0.5, a: 0, b: 0 }, t: 0.5 }],
      oklabPositions: [{ L: 0.5, a: 0, b: 0 }],
      energy: 0,
      minDeltaE: 0,
      p: 2,
      stepSize: 0.01,
    },
  ],
  finalColors: ['#777777'],
  clippedIndices: [],
  clippedPositions: [{ L: 0.5, a: 0, b: 0 }],
  liftConfig: { rs: 0.04, R: 0.15, gamma: 1 },
  vividness: 2,
  spread: 1.5,
  Lc: 0.5,
};
```

Add these tests after the existing `it(...)`:

```typescript
  it('shows "In gamut" for a non-clipped point on last frame', () => {
    useStore.setState({ selectedIndex: 0, currentFrame: 0 });
    const html = renderToString(<PointInfoPanel />);
    expect(html).toContain('In gamut');
  });

  it('shows clipped values for a clipped point on last frame', () => {
    const clippedTrace: OptimizationTrace = {
      ...trace,
      clippedIndices: [0],
      clippedPositions: [{ L: 0.5, a: 0.1, b: 0.1 }],
    };
    useStore.setState({ trace: clippedTrace, selectedIndex: 0, currentFrame: 0 });
    const html = renderToString(<PointInfoPanel />);
    expect(html).toContain('Clipped');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/__tests__/PointInfoPanel.test.ts`
Expected: FAIL — "In gamut" and "Clipped" text not found.

- [ ] **Step 3: Implement clipped value display in `PointInfoPanel`**

Replace the contents of `apps/web/src/components/info/PointInfoPanel.tsx`:

```typescript
import { useStore } from '../../store';
import { oklabToOklch, oklabToHex } from 'facette';
import { formatOKLab, formatOKLCh, formatRGB } from '../../utils/color-format';

export function PointInfoPanel() {
  const trace = useStore((s) => s.trace);
  const currentFrame = useStore((s) => s.currentFrame);
  const selectedIndex = useStore((s) => s.selectedIndex);

  if (!trace || selectedIndex === null || currentFrame >= trace.frames.length) {
    return (
      <div className="w-64 text-xs text-gray-500 p-2">
        Click a point to inspect it
      </div>
    );
  }

  const frame = trace.frames[currentFrame];
  if (selectedIndex >= frame.particles.length || selectedIndex >= frame.oklabPositions.length) {
    return (
      <div className="w-64 text-xs text-gray-500 p-2">
        Click a point to inspect it
      </div>
    );
  }

  const particle = frame.particles[selectedIndex];
  const oklab = frame.oklabPositions[selectedIndex];
  const pos = particle.position;
  const lch = oklabToOklch(oklab);
  const hex = oklabToHex(oklab);

  // Clipped data is only available on the last frame
  const isLastFrame = currentFrame === trace.frames.length - 1;
  const hasClippedData = isLastFrame && trace.clippedPositions.length > selectedIndex;
  const isClipped = hasClippedData && trace.clippedIndices.includes(selectedIndex);
  const clippedOklab = hasClippedData ? trace.clippedPositions[selectedIndex] : null;
  const clippedLch = clippedOklab ? oklabToOklch(clippedOklab) : null;
  const clippedHex = clippedOklab ? oklabToHex(clippedOklab) : null;

  return (
    <div className="w-64 text-xs font-mono space-y-1 p-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded border border-gray-600" style={{ backgroundColor: hex }} />
        <span className="text-gray-300">{hex}</span>
        <span className="text-gray-500">{particle.kind}</span>
      </div>
      <div className="text-gray-400">
        <div>OKLab: {formatOKLab(oklab)}</div>
        <div>OKLCh: {formatOKLCh(lch)}</div>
        <div>Lifted: {formatOKLab(pos)}</div>
        <div>RGB: {formatRGB(hex)}</div>
        <div className="text-gray-500 mt-1">γ: {trace.liftConfig.gamma.toFixed(2)} · s: {trace.spread.toFixed(2)}</div>
      </div>
      {hasClippedData && (
        <div className="border-t border-gray-700 pt-1 mt-1">
          {isClipped ? (
            <div className="text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: clippedHex! }} />
                <span className="text-yellow-400 text-[10px]">Clipped</span>
              </div>
              <div>OKLab: {formatOKLab(clippedOklab!)}</div>
              <div>OKLCh: {formatOKLCh(clippedLch!)}</div>
              <div>RGB: {formatRGB(clippedHex!)}</div>
            </div>
          ) : (
            <span className="text-green-400 text-[10px]">In gamut</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/__tests__/PointInfoPanel.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/info/PointInfoPanel.tsx apps/web/src/__tests__/PointInfoPanel.test.tsx
git commit -m "feat(web): show clipped and unclipped values in PointInfoPanel"
```

---

### Task 8: Add Clipping toggle to `LayerToggles`

**Files:**
- Modify: `apps/web/src/components/controls/LayerToggles.tsx`

- [ ] **Step 1: Add the Clipping checkbox with disabled state when lifted**

Replace the contents of `apps/web/src/components/controls/LayerToggles.tsx`:

```typescript
import { useStore } from '../../store';

export function LayerToggles() {
  const showSeeds = useStore((s) => s.showSeeds);
  const showGenerated = useStore((s) => s.showGenerated);
  const showHull = useStore((s) => s.showHull);
  const showGamut = useStore((s) => s.showGamut);
  const showAxes = useStore((s) => s.showAxes);
  const showClipping = useStore((s) => s.showClipping);
  const morphT = useStore((s) => s.morphT);
  const toggleSeeds = useStore((s) => s.toggleSeeds);
  const toggleGenerated = useStore((s) => s.toggleGenerated);
  const toggleHull = useStore((s) => s.toggleHull);
  const toggleGamut = useStore((s) => s.toggleGamut);
  const toggleAxes = useStore((s) => s.toggleAxes);
  const toggleClipping = useStore((s) => s.toggleClipping);

  const isLifted = morphT > 0;

  const toggles = [
    { label: 'Seeds', checked: showSeeds, toggle: toggleSeeds },
    { label: 'Generated', checked: showGenerated, toggle: toggleGenerated },
    { label: 'Hull', checked: showHull, toggle: toggleHull },
    { label: 'Gamut', checked: showGamut, toggle: toggleGamut },
    { label: 'Axes', checked: showAxes, toggle: toggleAxes },
    { label: 'Clipping', checked: showClipping, toggle: toggleClipping, disabled: isLifted, title: isLifted ? 'Only available in unlifted mode' : undefined },
  ];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">Layers</span>
      <div className="flex gap-2 flex-wrap">
        {toggles.map(({ label, checked, toggle, disabled, title }) => (
          <label
            key={label}
            className={`flex items-center gap-1 text-xs cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={title}
          >
            <input type="checkbox" checked={checked} onChange={toggle} className="rounded" disabled={disabled} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all web tests for regressions**

Run: `cd apps/web && npx vitest run`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/controls/LayerToggles.tsx
git commit -m "feat(web): add Clipping toggle to LayerToggles with disabled state when lifted"
```

---

### Task 9: Update existing test fixtures for `clippedPositions`

**Files:**
- Modify: `apps/web/src/__tests__/PointInfoPanel.test.tsx` (already done in Task 7)

- [ ] **Step 1: Run the full test suite across both packages**

Run: `cd packages/core && npx vitest run && cd ../../apps/web && npx vitest run`
Expected: All PASS in both packages.

- [ ] **Step 2: Manual verification**

Run: `pnpm turbo dev`

1. Open the web app in browser
2. Generate a palette (any seeds, e.g., `#ff0000`, `#00ff00`, `#0000ff` with size 8)
3. Verify the "Clipping" checkbox appears in the Layers panel
4. Verify it's enabled when in OKLab (unlifted) mode
5. Toggle "Clipping" on — points should snap to gamut boundary, playback should jump to last frame
6. Clipped points should show wireframe rings
7. Click a point — info panel should show both original and clipped values
8. Toggle "Lift" — clipping should auto-disable, checkbox should grey out
9. Scrub to earlier frame — clipping should auto-disable

- [ ] **Step 3: Final commit if any fixture or cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for clipping visualization feature"
```
