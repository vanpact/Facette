import { SeedEditor } from '../controls/SeedEditor';
import { PaletteControls } from '../controls/PaletteControls';
import { PlaybackControls } from '../controls/PlaybackControls';
import { LayerToggles } from '../controls/LayerToggles';
import { OKLabViewer } from '../viewers/OKLabViewer';
import { OKLChViewer } from '../viewers/OKLChViewer';
import { PointInfoPanel } from '../info/PointInfoPanel';
import { EnergyGraph } from '../info/EnergyGraph';
import { PaletteStrip } from '../palette/PaletteStrip';
import { useSyncedCamera } from '../../hooks/useSyncedCamera';

export function DashboardLayout() {
  const { leftRef, rightRef } = useSyncedCamera();

  return (
    <div className="h-screen grid grid-rows-[auto_1fr_auto] gap-1 p-2 bg-gray-950">
      {/* Top: Controls */}
      <div className="flex gap-6 items-start bg-gray-900 rounded-lg p-3">
        <SeedEditor />
        <PaletteControls />
        <PlaybackControls />
        <LayerToggles />
      </div>

      {/* Middle: Dual 3D Viewers */}
      <div className="grid grid-cols-2 gap-1 min-h-0">
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <OKLabViewer controlsRef={leftRef} />
        </div>
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <OKLChViewer controlsRef={rightRef} />
        </div>
      </div>

      {/* Bottom: Info Panels */}
      <div className="flex gap-3 items-start bg-gray-900 rounded-lg p-3">
        <PointInfoPanel />
        <EnergyGraph />
        <PaletteStrip />
      </div>
    </div>
  );
}
