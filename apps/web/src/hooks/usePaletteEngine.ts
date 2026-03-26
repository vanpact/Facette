import { useCallback } from 'react';
import { createPaletteStepper } from 'facette';
import type { PaletteOptions } from 'facette';
import { useStore } from '../store';

export function usePaletteEngine() {
  const seeds = useStore((s) => s.seeds);
  const paletteSize = useStore((s) => s.paletteSize);
  const vividness = useStore((s) => s.vividness);
  const gamma = useStore((s) => s.gamma);
  const setTrace = useStore((s) => s.setTrace);
  const setIsComputing = useStore((s) => s.setIsComputing);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setIsPlaying = useStore((s) => s.setIsPlaying);

  const regenerate = useCallback(() => {
    if (seeds.length < 2) return;

    setIsComputing(true);
    setIsPlaying(false);

    try {
      const options: PaletteOptions = {};
      if (vividness > 0) options.vividness = vividness;
      if (gamma > 1) options.gamma = gamma;
      const stepper = createPaletteStepper(seeds, paletteSize,
        Object.keys(options).length > 0 ? options : undefined);
      const trace = stepper.run();
      setTrace(trace);
      setCurrentFrame(0);
    } catch (e) {
      console.error('Palette generation failed:', e);
      setTrace(null);
    } finally {
      setIsComputing(false);
    }
  }, [seeds, paletteSize, vividness, gamma, setTrace, setIsComputing, setCurrentFrame, setIsPlaying]);

  return { regenerate };
}
