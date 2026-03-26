import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function usePlayback() {
  const isPlaying = useStore((s) => s.isPlaying);
  const trace = useStore((s) => s.trace);

  const lastTimeRef = useRef(0);
  const frameAccRef = useRef(0);

  useEffect(() => {
    if (!isPlaying || !trace) return;

    const totalFrames = trace.frames.length;
    lastTimeRef.current = 0;
    frameAccRef.current = 0;

    let rafId: number;

    const tick = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const speed = useStore.getState().speed;
      frameAccRef.current += delta * speed;
      const framesToAdvance = Math.floor(frameAccRef.current);
      frameAccRef.current -= framesToAdvance;

      if (framesToAdvance > 0) {
        const current = useStore.getState().currentFrame;
        const next = current + framesToAdvance;
        if (next >= totalFrames) {
          useStore.getState().setCurrentFrame(totalFrames - 1);
          useStore.getState().setIsPlaying(false);
          return;
        }
        useStore.getState().setCurrentFrame(next);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, trace]);
}
