// scripts/generate-readme-assets.ts
import { generatePalette } from '../packages/core/src/facette';
import { writeFileSync, mkdirSync } from 'fs';

interface Example {
  label: string;
  seeds: string[];
  size: number;
  vividness?: number;
  spread?: number;
}

const examples: Example[] = [
  {
    label: 'Vivid complementary',
    seeds: ['#e63946', '#2a9d8f'],
    size: 6,
    vividness: 0.5,
    spread: 2.0,
  },
  {
    label: 'Warm cluster',
    seeds: ['#ff6b6b', '#ee5a24', '#f0932b', '#ffbe76'],
    size: 8,
    vividness: 1.0,
    spread: 1.2,
  },
  {
    label: 'Muted earth tones',
    seeds: ['#a09080', '#8e7b6b', '#6b7e6b'],
    size: 6,
    vividness: 1.0,
    spread: 2.0,
  },
  {
    label: 'Full spectrum',
    seeds: ['#a92323', '#4c85a9', '#1d3557', '#707a00'],
    size: 10,
    vividness: 1.0,
    spread: 1.2,
  },
  {
    label: 'Vivid rainbow',
    seeds: ['#ff2d55', '#ff9500', '#34c759', '#007aff', '#af52de', '#ffcc00'],
    size: 12,
    vividness: 3.0,
    spread: 1.2,
  },
];

function generateExamplesSVG(): string {
  const width = 800;
  const rowHeight = 70;
  const gap = 16;
  const swatchSize = 32;
  const swatchGap = 4;
  const labelWidth = 160;
  const arrowWidth = 28;
  const topPadding = 24;
  const height = topPadding + examples.length * (rowHeight + gap);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#0d1117" rx="12"/>`;

  // Title
  svg += `<text x="${width / 2}" y="18" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11" text-anchor="middle" font-weight="500">Generated with Facette</text>`;

  for (let rowIdx = 0; rowIdx < examples.length; rowIdx++) {
    const ex = examples[rowIdx];
    const options: Record<string, number> = {};
    if (ex.vividness != null) options.vividness = ex.vividness;
    if (ex.spread != null) options.spread = ex.spread;
    const result = generatePalette(ex.seeds, ex.size, options);
    const y = topPadding + rowIdx * (rowHeight + gap) + 10;

    // Row label
    svg += `<text x="16" y="${y + 22}" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="11">${ex.label}</text>`;

    // Seed swatches
    let x = labelWidth;
    for (const seed of ex.seeds) {
      svg += `<rect x="${x}" y="${y}" width="${swatchSize}" height="${swatchSize}" rx="6" fill="${seed}"/>`;
      // Small dot indicator for seeds
      svg += `<circle cx="${x + swatchSize / 2}" cy="${y + swatchSize + 6}" r="2" fill="#8b949e"/>`;
      x += swatchSize + swatchGap;
    }

    // Arrow
    const arrowX = x + 10;
    svg += `<text x="${arrowX}" y="${y + 22}" fill="#484f58" font-family="system-ui, sans-serif" font-size="18">&#x2192;</text>`;

    // Generated (non-seed) swatches only
    const generated = result.colors.filter((c) => !ex.seeds.includes(c));
    x = arrowX + arrowWidth;
    for (const color of generated) {
      svg += `<rect x="${x}" y="${y}" width="${swatchSize}" height="${swatchSize}" rx="6" fill="${color}"/>`;
      x += swatchSize + swatchGap;
    }
  }

  svg += '</svg>';
  return svg;
}

mkdirSync('docs/assets', { recursive: true });
const examplesSVG = generateExamplesSVG();
writeFileSync('docs/assets/examples.svg', examplesSVG);
console.log('Generated docs/assets/examples.svg');
