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
  const isClipped = hasClippedData && new Set(trace.clippedIndices).has(selectedIndex);
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
