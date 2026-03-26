import { useStore } from '../../store';
import { usePaletteEngine } from '../../hooks/usePaletteEngine';

export function PaletteControls() {
  const paletteSize = useStore((s) => s.paletteSize);
  const vividness = useStore((s) => s.vividness);
  const setPaletteSize = useStore((s) => s.setPaletteSize);
  const setVividness = useStore((s) => s.setVividness);
  const isComputing = useStore((s) => s.isComputing);
  const seeds = useStore((s) => s.seeds);
  const { regenerate } = usePaletteEngine();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 w-12">N: {paletteSize}</label>
        <input
          type="range"
          min={seeds.length}
          max={20}
          value={paletteSize}
          onChange={(e) => setPaletteSize(Number(e.target.value))}
          onMouseUp={regenerate}
          className="w-24"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 w-12">{vividness === 0 ? 'Auto' : `V: ${vividness.toFixed(3)}`}</label>
        <input
          type="range"
          min={0}
          max={100}
          value={vividness * 1000}
          onChange={(e) => setVividness(Number(e.target.value) / 1000)}
          onMouseUp={regenerate}
          className="w-24"
        />
      </div>
      <button
        onClick={regenerate}
        disabled={isComputing}
        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded"
      >
        {isComputing ? 'Computing...' : 'Regenerate'}
      </button>
    </div>
  );
}
