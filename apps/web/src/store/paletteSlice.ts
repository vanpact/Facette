import type { StateCreator } from 'zustand';
import type { OptimizationTrace } from 'facette';

export interface PaletteSlice {
  seeds: string[];
  paletteSize: number;
  vividness: number;
  spread: number;
  trace: OptimizationTrace | null;
  isComputing: boolean;

  setSeeds: (seeds: string[]) => void;
  addSeed: (hex: string) => void;
  removeSeed: (index: number) => void;
  updateSeed: (index: number, hex: string) => void;
  setPaletteSize: (n: number) => void;
  setVividness: (v: number) => void;
  setSpread: (s: number) => void;
  setTrace: (trace: OptimizationTrace | null) => void;
  setIsComputing: (v: boolean) => void;
}

export const createPaletteSlice: StateCreator<PaletteSlice, [], [], PaletteSlice> = (set) => ({
  seeds: ['#e63946', '#457b9d', '#1d3557'],
  paletteSize: 8,
  vividness: 2,
  spread: 1.5,
  trace: null,
  isComputing: false,

  setSeeds: (seeds) => set({ seeds }),
  addSeed: (hex) => set((s) => ({ seeds: [...s.seeds, hex] })),
  removeSeed: (index) => set((s) => ({ seeds: s.seeds.filter((_: string, i: number) => i !== index) })),
  updateSeed: (index, hex) => set((s) => ({
    seeds: s.seeds.map((c: string, i: number) => (i === index ? hex : c)),
  })),
  setPaletteSize: (n) => set({ paletteSize: n }),
  setVividness: (v) => set({ vividness: v }),
  setSpread: (s) => set({ spread: s }),
  setTrace: (trace) => set({ trace }),
  setIsComputing: (v) => set({ isComputing: v }),
});
