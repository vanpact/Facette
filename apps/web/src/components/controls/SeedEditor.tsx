import { useStore } from '../../store';
import { usePaletteEngine } from '../../hooks/usePaletteEngine';

export function SeedEditor() {
  const seeds = useStore((s) => s.seeds);
  const updateSeed = useStore((s) => s.updateSeed);
  const removeSeed = useStore((s) => s.removeSeed);
  const addSeed = useStore((s) => s.addSeed);
  const { regenerate } = usePaletteEngine();

  const handleChange = (index: number, hex: string) => {
    updateSeed(index, hex);
  };

  const handleRemove = (index: number) => {
    if (seeds.length <= 2) return;
    removeSeed(index);
  };

  const handleAdd = () => {
    addSeed('#888888');
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">Seeds</span>
      <div className="flex gap-1 items-center flex-wrap">
        {seeds.map((color, i) => (
          <div key={i} className="relative group">
            <input
              type="color"
              value={color}
              onChange={(e) => handleChange(i, e.target.value)}
              onBlur={regenerate}
              className="w-8 h-8 rounded cursor-pointer border border-gray-600"
            />
            {seeds.length > 2 && (
              <button
                onClick={() => { handleRemove(i); setTimeout(regenerate, 0); }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] leading-none hidden group-hover:flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => { handleAdd(); setTimeout(regenerate, 0); }}
          className="w-8 h-8 rounded border border-dashed border-gray-500 text-gray-400 hover:border-gray-300 hover:text-gray-200 text-lg"
        >
          +
        </button>
      </div>
    </div>
  );
}
