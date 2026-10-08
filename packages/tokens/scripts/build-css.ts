import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCssVariables, toFontFaceCss } from '../src/css';

const require = createRequire(import.meta.url);
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../css');
mkdirSync(outDir, { recursive: true });

const write = (name: string, content: string) => {
  const out = resolve(outDir, name);
  writeFileSync(out, content);
  console.log(`wrote ${out}`);
};

write('tokens.css', toCssVariables());
write(
  'fonts.css',
  toFontFaceCss((pkg, weight) => readFileSync(require.resolve(`${pkg}/${weight}.css`), 'utf8')),
);
