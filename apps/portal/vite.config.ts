import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The dark background color, read from the generated tokens CSS (the single source of truth). */
const themeColor = /--color-bg:\s*(#[0-9a-fA-F]{6})/.exec(
  readFileSync(new URL('../../packages/tokens/css/tokens.css', import.meta.url), 'utf8'),
)?.[1];

/** Public pages: listed in sitemap.xml. The pages behind the login are not. */
const PUBLIC_PATHS = [
  '/',
  '/plans',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/delete-account',
];
const PRIVATE_PATHS = ['/account', '/pay', '/status', '/verify', '/forgot', '/reset'];

/**
 * - fills the public URL (og:url, og:image, canonical) and the theme color from the tokens;
 * - preloads the fonts the first screen needs (the Mongolian text uses the cyrillic and
 *   cyrillic-ext subsets) so the text does not jump when they arrive;
 * - writes robots.txt and sitemap.xml next to the build.
 */
function seo(publicUrl: string): Plugin {
  // Only what the first screen draws: body text (Inter 400) and buttons/headings (Inter 600) in
  // both Cyrillic subsets (the ү/ө letters live in cyrillic-ext), and the brand name (Lora 600).
  // More preloads would compete with the JavaScript for the same slow connection.
  const wanted = [
    /inter-cyrillic-ext-400-normal/,
    /inter-cyrillic-400-normal/,
    /inter-cyrillic-ext-600-normal/,
    /inter-cyrillic-600-normal/,
    /lora-cyrillic-600-normal/,
  ];
  return {
    name: 'ongod-seo',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const filled = html
          .replaceAll('__PUBLIC_URL__', publicUrl)
          .replaceAll('__THEME_COLOR__', themeColor ?? '');
        const bundle = ctx.bundle;
        if (!bundle) return filled;
        const links = Object.keys(bundle)
          .filter((name) => name.endsWith('.woff2') && wanted.some((re) => re.test(name)))
          .map(
            (name) =>
              `    <link rel="preload" href="/${name}" as="font" type="font/woff2" crossorigin />`,
          );
        return filled.replace('</head>', `${links.join('\n')}\n  </head>`);
      },
    },
    generateBundle() {
      const disallow = [...PRIVATE_PATHS, '/v1/', '/admin/']
        .map((p) => `Disallow: ${p}`)
        .join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\n${disallow}\n\nSitemap: ${publicUrl}/sitemap.xml\n`,
      });
      const urls = PUBLIC_PATHS.map(
        (p) => `  <url><loc>${publicUrl}${p === '/' ? '' : p}</loc></url>`,
      ).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

/**
 * Writes a brotli (.br) and a gzip (.gz) copy next to every text file of the build. The API
 * serves them to browsers that accept them (@fastify/static preCompressed), so the files are
 * compressed once at build time, not on every request.
 */
function precompress(): Plugin {
  const compressible = /\.(?:js|css|html|svg|json|xml|txt)$/;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return {
    name: 'ongod-precompress',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      if (!options.dir) return;
      for (const file of walk(options.dir)) {
        if (!compressible.test(file) || statSync(file).size < 1024) continue;
        const data = readFileSync(file);
        writeFileSync(
          `${file}.br`,
          brotliCompressSync(data, {
            params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
          }),
        );
        writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
      }
    },
  };
}

/**
 * VITE_PUBLIC_URL comes from the environment or from the repo's root .env. Only this one key is
 * read: pointing Vite's own env loader at the root .env would also pick up its NODE_ENV=development
 * and silently turn a production build into a development build.
 */
function publicUrlFromEnv(): string {
  let value = process.env.VITE_PUBLIC_URL;
  const file = new URL('../../.env', import.meta.url);
  if (!value && existsSync(file)) {
    value = /^VITE_PUBLIC_URL=(.*)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim();
  }
  return (value || 'http://localhost:5173').replace(/\/$/, '');
}

/** A production build must be a production build (no dev code in what customers download). */
function requireProduction(): Plugin {
  return {
    name: 'ongod-require-production',
    configResolved(config) {
      if (config.command === 'build' && !config.isProduction) {
        throw new Error(
          'Refusing to build the portal in development mode. Unset NODE_ENV (or set it to production).',
        );
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), seo(publicUrlFromEnv()), precompress(), requireProduction()],
  server: {
    port: 5173,
    // A busy port is an error, not a silent move: the printed URLs must stay true.
    strictPort: true,
    proxy: { '/v1': 'http://localhost:3000' },
  },
});
