import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCssVariables } from '../src/css';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../css/tokens.css');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCssVariables());
console.log(`wrote ${out}`);
