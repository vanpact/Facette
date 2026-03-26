import { useRef, useEffect } from 'react';
import { useStore } from '../../store';

export function EnergyGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trace = useStore((s) => s.trace);
  const currentFrame = useStore((s) => s.currentFrame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trace) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const energies = trace.frames.map((f) => f.energy);
    const maxE = Math.max(...energies);
    const minE = Math.min(...energies);
    const range = maxE - minE || 1;

    // Draw energy line
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < energies.length; i++) {
      const x = (i / (energies.length - 1)) * width;
      const y = height - ((energies[i] - minE) / range) * (height - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current frame indicator
    if (energies.length > 1) {
      const fx = (currentFrame / (energies.length - 1)) * width;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx, height);
      ctx.stroke();
    }
  }, [trace, currentFrame]);

  return (
    <div className="flex flex-col gap-1 flex-1">
      <span className="text-xs text-gray-400 font-medium">Energy</span>
      <canvas
        ref={canvasRef}
        width={300}
        height={60}
        className="bg-gray-800 rounded w-full"
      />
    </div>
  );
}
