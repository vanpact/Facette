import { useStore } from '../../store';

export function PaletteStrip() {
  const trace = useStore((s) => s.trace);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const selectedIndex = useStore((s) => s.selectedIndex);

  if (!trace) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">Palette</span>
      <div className="flex gap-0.5">
        {trace.finalColors.map((color, i) => (
          <button
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={`w-8 h-8 rounded border-2 transition-all ${
              selectedIndex === i ? 'border-white scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}
