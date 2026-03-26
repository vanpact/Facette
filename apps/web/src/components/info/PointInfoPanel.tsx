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
  const particle = frame.particles[selectedIndex];
  const warped = frame.warpedPositions[selectedIndex];
  const pos = particle.position;
  const lch = oklabToOklch(pos);
  const hex = oklabToHex(pos);
  const warpedLch = oklabToOklch(warped);

  return (
    <div className="w-64 text-xs font-mono space-y-1 p-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded border border-gray-600" style={{ backgroundColor: hex }} />
        <span className="text-gray-300">{hex}</span>
        <span className="text-gray-500">{particle.kind}</span>
      </div>
      <div className="text-gray-400">
        <div>OKLab: {formatOKLab(pos)}</div>
        <div>OKLCh: {formatOKLCh(lch)}</div>
        <div>Warped: {formatOKLab(warped)}</div>
        <div>RGB: {formatRGB(hex)}</div>
      </div>
    </div>
  );
}
