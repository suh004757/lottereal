#!/usr/bin/env node
// Rewrites the static neighborhood cards in public/songpa-neighborhood-guide.html from
// public/Data/songpa-neighborhood-guide.v1.json. Run after editing the JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceNeighborhoodCards } from '../public/js/songpaNeighborhoodCards.mjs';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const page = path.join(PUBLIC, 'songpa-neighborhood-guide.html');
const config = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'Data', 'songpa-neighborhood-guide.v1.json'), 'utf8'));
const html = fs.readFileSync(page, 'utf8');
const next = replaceNeighborhoodCards(html, config.neighborhoods);
if (next === null) {
  console.error('neighborhood card markers not found');
  process.exit(1);
}
if (next !== html) fs.writeFileSync(page, next);
console.log(next === html ? 'unchanged' : 'updated');
