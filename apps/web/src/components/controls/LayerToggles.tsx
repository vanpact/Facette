import { useStore } from '../../store';

export function LayerToggles() {
  const showSeeds = useStore((s) => s.showSeeds);
  const showGenerated = useStore((s) => s.showGenerated);
  const showHull = useStore((s) => s.showHull);
  const showGamut = useStore((s) => s.showGamut);
  const showAxes = useStore((s) => s.showAxes);
  const toggleSeeds = useStore((s) => s.toggleSeeds);
  const toggleGenerated = useStore((s) => s.toggleGenerated);
  const toggleHull = useStore((s) => s.toggleHull);
  const toggleGamut = useStore((s) => s.toggleGamut);
  const toggleAxes = useStore((s) => s.toggleAxes);

  const toggles = [
    { label: 'Seeds', checked: showSeeds, toggle: toggleSeeds },
    { label: 'Generated', checked: showGenerated, toggle: toggleGenerated },
    { label: 'Hull', checked: showHull, toggle: toggleHull },
    { label: 'Gamut', checked: showGamut, toggle: toggleGamut },
    { label: 'Axes', checked: showAxes, toggle: toggleAxes },
  ];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">Layers</span>
      <div className="flex gap-2 flex-wrap">
        {toggles.map(({ label, checked, toggle }) => (
          <label key={label} className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={checked} onChange={toggle} className="rounded" />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
