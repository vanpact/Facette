import { useStore } from '../../store';

export function PlaybackControls() {
  const currentFrame = useStore((s) => s.currentFrame);
  const isPlaying = useStore((s) => s.isPlaying);
  const speed = useStore((s) => s.speed);
  const trace = useStore((s) => s.trace);
  const togglePlayback = useStore((s) => s.togglePlayback);
  const stepForward = useStore((s) => s.stepForward);
  const stepBackward = useStore((s) => s.stepBackward);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setSpeed = useStore((s) => s.setSpeed);

  const totalFrames = trace?.frames.length ?? 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">Playback</span>
      <div className="flex items-center gap-1">
        <button onClick={stepBackward} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded">⏮</button>
        <button onClick={togglePlayback} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={stepForward} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded">⏭</button>
        <span className="text-xs text-gray-400 font-mono ml-1">
          {currentFrame}/{totalFrames > 0 ? totalFrames - 1 : 0}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={(e) => setCurrentFrame(Number(e.target.value))}
          className="w-32"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Speed: {speed}fps</label>
        <input
          type="range"
          min={1}
          max={120}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-20"
        />
      </div>
    </div>
  );
}
