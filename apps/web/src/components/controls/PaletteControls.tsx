import { useStore } from '../../store';
import { usePaletteEngine } from '../../hooks/usePaletteEngine';

export function PaletteControls() {
  const paletteSize = useStore((s) => s.paletteSize);
  const vividness = useStore((s) => s.vividness);
  const setPaletteSize = useStore((s) => s.setPaletteSize);
  const setVividness = useStore((s) => s.setVividness);
  const gamma = useStore((s) => s.gamma);
  const setGamma = useStore((s) => s.setGamma);
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
          onChange={(e) => {
            const raw = Number(e.target.value) / 1000;
            // Snap values below 0.005 to 0 (auto mode) to avoid invalid range
            setVividness(raw > 0 && raw < 0.005 ? 0 : raw);
          }}
          onMouseUp={regenerate}
          className="w-24"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 w-12">{gamma === 1 ? 'γ: 1' : `γ: ${gamma.toFixed(1)}`}</label>
        <input
          type="range"
          min={10}
          max={30}
          value={gamma * 10}
          onChange={(e) => setGamma(Number(e.target.value) / 10)}
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
