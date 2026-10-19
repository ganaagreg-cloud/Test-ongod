import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSync, transformSync, traverse } from '@babel/core';

// Animation code (useAnimatedStyle, useAnimatedProps, scroll and gesture handlers, ...) runs on
// the UI thread as worklets. There it may only call other worklets: a plain function (e.g.
// `withAlpha` from @ongod/tokens) throws on the phone and takes the screen down, while the
// browser preview and the other tests run everything on the JS thread and never notice. This
// compiles the app the way Metro does for iOS and checks the direct calls of every worklet.
// Passing a plain function to `scheduleOnRN(fn)` is fine: that is how a worklet calls back.

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const preset = require.resolve('babel-preset-expo');

/** Modules whose exports are worklets (or safe to call from one). */
const WORKLET_MODULES = new Set(['react-native-reanimated', 'react-native-worklets']);

type Node = { type: string; [key: string]: unknown };

/** What a worklet in this source may call: Reanimated / Worklets imports and its own worklets. */
function allowedCallees(source: string, filename: string): Set<string> {
  const ast = parseSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
  });
  const allowed = new Set<string>();
  const isWorklet = (fn: unknown) => {
    if (!fn) return false; // `let x;` has no initial value
    const body = (fn as { body?: { directives?: Array<{ value: { value: string } }> } }).body;
    return body?.directives?.some((d) => d.value.value === 'worklet') ?? false;
  };
  traverse(ast!, {
    ImportDeclaration(path) {
      if (!WORKLET_MODULES.has(path.node.source.value)) return;
      for (const specifier of path.node.specifiers) allowed.add(specifier.local.name);
    },
    FunctionDeclaration(path) {
      if (path.node.id && isWorklet(path.node)) allowed.add(path.node.id.name);
    },
    VariableDeclarator(path) {
      if (path.node.id.type === 'Identifier' && isWorklet(path.node.init)) {
        allowed.add(path.node.id.name);
      }
    },
  });
  return allowed;
}

/** The source of every worklet the plugin produced (its `__initData.code`). */
function workletCodes(source: string, filename: string): string[] {
  const out = transformSync(source, {
    filename,
    cwd: root,
    babelrc: false,
    configFile: false,
    presets: [preset],
    caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: true } as never,
    ast: true,
    code: false,
  });
  const codes: string[] = [];
  traverse(out!.ast!, {
    ObjectExpression(path) {
      const props = path.node.properties as Node[];
      const key = (p: Node) => ((p.key as Node | undefined)?.name as string | undefined) ?? '';
      const code = props.find((p) => p.type === 'ObjectProperty' && key(p) === 'code');
      const value = code?.value as Node | undefined;
      if (props.some((p) => key(p) === 'location') && value?.type === 'StringLiteral') {
        codes.push(value.value as string);
      }
    },
  });
  return codes;
}

/** Calls in worklet code to captured names that are not worklets. */
function violations(source: string, filename: string): string[] {
  const allowed = allowedCallees(source, filename);
  const found: string[] = [];
  for (const code of workletCodes(source, filename)) {
    const ast = parseSync(code, { babelrc: false, configFile: false });
    const captured = new Set<string>();
    traverse(ast!, {
      VariableDeclarator(path) {
        const init = path.node.init;
        if (
          init?.type === 'MemberExpression' &&
          init.object.type === 'ThisExpression' &&
          init.property.type === 'Identifier' &&
          init.property.name === '__closure' &&
          path.node.id.type === 'ObjectPattern'
        ) {
          for (const p of path.node.id.properties) {
            if (p.type === 'ObjectProperty' && p.value.type === 'Identifier') {
              captured.add(p.value.name);
            }
          }
        }
      },
    });
    traverse(ast!, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type !== 'Identifier') return;
        if (captured.has(callee.name) && !allowed.has(callee.name)) found.push(`${callee.name}()`);
      },
    });
  }
  return [...new Set(found)];
}

const files = ['src', 'app'].flatMap((dir) =>
  (readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true }) as string[])
    .map((file) => `${dir}/${file.replaceAll('\\', '/')}`)
    // The browser preview has no UI thread; everything else ships to the phone.
    .filter((file) => /\.tsx?$/.test(file) && !/\.web\.tsx?$/.test(file)),
);

test('animation code on the UI thread only calls worklets', () => {
  const problems: string[] = [];
  let checked = 0;
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    if (!/react-native-reanimated|react-native-worklets/.test(source)) continue;
    checked++;
    for (const call of violations(source, `${root}${file}`)) problems.push(`${file}: ${call}`);
  }
  assert.ok(checked >= 10, `only ${checked} files with animations found`);
  assert.deepEqual(problems, [], 'compute these values outside the worklet, or mark them worklets');
});

test('the check catches a plain function called from a worklet', () => {
  const source = `
    import { useAnimatedStyle, useSharedValue, interpolate } from 'react-native-reanimated';
    import { scheduleOnRN } from 'react-native-worklets';
    import { withAlpha } from '@ongod/tokens';
    const fade = (v: number) => { 'worklet'; return v / 2; };
    export function Box({ onDone }: { onDone: () => void }) {
      const x = useSharedValue(0);
      useAnimatedStyle(() => {
        if (x.value > 1) scheduleOnRN(onDone);
        return { opacity: fade(interpolate(x.value, [0, 1], [0, 1])), color: withAlpha('#ffffff', 0.5) };
      });
      useAnimatedStyle(() => ({ opacity: x.value }));
      return null;
    }`;
  // The worklets plugin reads the file from disk for its source map.
  const dir = mkdtempSync(join(tmpdir(), 'ongod-worklets-'));
  try {
    const fixture = join(dir, 'Box.tsx');
    writeFileSync(fixture, source);
    assert.deepEqual(violations(source, fixture), ['withAlpha()']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
