import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../src/lib/env.js';
import { initials, slugify } from './helpers.js';

/**
 * Placeholder artwork.
 *
 * Nothing is downloaded: each product gets a tiny deterministic SVG (a coloured
 * rounded rectangle with the product's initials) written into the uploads
 * directory, so the quick grid and the storefront render real images instead of
 * broken links.
 */

const SEED_DIR = 'seed';

export function seedImageDir(): string {
  return path.join(env.uploadDir, SEED_DIR);
}

/** Wipes the folder so a re-run cannot leave orphans behind. */
export function resetSeedImages(): void {
  const dir = seedImageDir();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Deterministic hue from the name, for products with no tile colour. */
function fallbackColor(name: string): string {
  const palette = [
    '#EF5B5B',
    '#F2814B',
    '#A8213C',
    '#16A34A',
    '#E0364A',
    '#2F80ED',
    '#D6499B',
    '#0E9F9F',
    '#7C4DFF',
    '#5B6B7C',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length] as string;
}

/**
 * Writes /uploads/seed/<slug>.svg and returns the public URL. Well under 1 KB.
 */
export function writeSeedImage(
  name: string,
  options: { color?: string | null; prefix?: string } = {},
): string {
  const slug = (options.prefix ? `${options.prefix}-` : '') + slugify(name);
  const fill = options.color ?? fallbackColor(name);
  const label = initials(name);

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">',
    `<rect x="4" y="4" width="192" height="192" rx="28" fill="${fill}"/>`,
    '<rect x="4" y="4" width="192" height="192" rx="28" fill="none" stroke="#00000022" stroke-width="3"/>',
    `<text x="100" y="118" font-family="Inter,Segoe UI,sans-serif" font-size="74" font-weight="700"`,
    ` fill="#ffffff" text-anchor="middle">${label}</text>`,
    '</svg>',
  ].join('');

  fs.writeFileSync(path.join(seedImageDir(), `${slug}.svg`), svg, 'utf8');
  return `${env.publicUploadBase}/${SEED_DIR}/${slug}.svg`;
}
