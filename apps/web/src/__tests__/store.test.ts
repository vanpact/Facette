import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

beforeEach(() => {
  useStore.setState({
    seeds: ['#e63946', '#457b9d', '#1d3557'],
    paletteSize: 8,
    vividness: 2,
    spread: 1.5,
    trace: null,
    isComputing: false,
    showSeeds: true,
    showGenerated: true,
    showHull: true,
    showGamut: false,
    showAxes: true,
    morphT: 0,
    currentFrame: 0,
    isPlaying: false,
    speed: 30,
    selectedIndex: null,
    hoveredIndex: null,
  });
});

describe('paletteSlice', () => {
  it('has default seeds', () => {
    expect(useStore.getState().seeds.length).toBe(3);
  });

  it('addSeed appends', () => {
    useStore.getState().addSeed('#ff0000');
    expect(useStore.getState().seeds).toContain('#ff0000');
    expect(useStore.getState().seeds.length).toBe(4);
  });

  it('removeSeed removes by index', () => {
    useStore.getState().removeSeed(0);
    expect(useStore.getState().seeds.length).toBe(2);
    expect(useStore.getState().seeds[0]).toBe('#457b9d');
  });

  it('updateSeed replaces at index', () => {
    useStore.getState().updateSeed(1, '#ccc');
    expect(useStore.getState().seeds[1]).toBe('#ccc');
  });

  it('setPaletteSize updates', () => {
    useStore.getState().setPaletteSize(12);
    expect(useStore.getState().paletteSize).toBe(12);
  });

  it('setVividness updates', () => {
    useStore.getState().setVividness(3);
    expect(useStore.getState().vividness).toBe(3);
  });

  it('setSpread updates', () => {
    useStore.getState().setSpread(1.5);
    expect(useStore.getState().spread).toBe(1.5);
  });
});

describe('playbackSlice', () => {
  it('togglePlayback flips state', () => {
    expect(useStore.getState().isPlaying).toBe(false);
    useStore.getState().togglePlayback();
    expect(useStore.getState().isPlaying).toBe(true);
    useStore.getState().togglePlayback();
    expect(useStore.getState().isPlaying).toBe(false);
  });

  it('stepForward increments frame', () => {
    useStore.getState().setCurrentFrame(5);
    useStore.getState().stepForward();
    expect(useStore.getState().currentFrame).toBe(6);
  });

  it('stepBackward does not go below 0', () => {
    useStore.getState().setCurrentFrame(0);
    useStore.getState().stepBackward();
    expect(useStore.getState().currentFrame).toBe(0);
  });

  it('setSpeed updates', () => {
    useStore.getState().setSpeed(60);
    expect(useStore.getState().speed).toBe(60);
  });
});

describe('viewerSlice', () => {
  it('toggles hull visibility', () => {
    expect(useStore.getState().showHull).toBe(true);
    useStore.getState().toggleHull();
    expect(useStore.getState().showHull).toBe(false);
  });

  it('toggles gamut visibility', () => {
    expect(useStore.getState().showGamut).toBe(false);
    useStore.getState().toggleGamut();
    expect(useStore.getState().showGamut).toBe(true);
  });

  it('sets morphT', () => {
    useStore.getState().setMorphT(0.5);
    expect(useStore.getState().morphT).toBe(0.5);
  });
});

describe('selectionSlice', () => {
  it('sets selected index', () => {
    useStore.getState().setSelectedIndex(3);
    expect(useStore.getState().selectedIndex).toBe(3);
  });

  it('clears selection with null', () => {
    useStore.getState().setSelectedIndex(3);
    useStore.getState().setSelectedIndex(null);
    expect(useStore.getState().selectedIndex).toBeNull();
  });

  it('sets hovered index', () => {
    useStore.getState().setHoveredIndex(2);
    expect(useStore.getState().hoveredIndex).toBe(2);
  });
});
