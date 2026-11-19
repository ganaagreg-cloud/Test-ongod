import { existsSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Same relative path from src/ (dev) and dist/ (build): apps/api/<dir>/ -> apps/<app>/dist
const appDist = (app: string) => fileURLToPath(new URL(`../../${app}/dist`, import.meta.url));

export const defaultStaticDirs = { portal: appDist('portal'), admin: appDist('admin') };

export const isApiPath = (url: string) =>
  url === '/v1' || url.startsWith('/v1/') || url.startsWith('/v1?') || url.startsWith('/health');

/**
 * A page request, not a missing file: the browser asks for text/html, but link checkers and
 * crawlers (for example the Google Play Console URL check) send `*\/*` or no Accept at all and
 * must see the page too, not a JSON 404. A path with a file extension (a missing asset) stays 404.
 */
const wantsPage = (url: string, accepts: string): boolean => {
  if (accepts.includes('text/html')) return true;
  const pathname = url.split('?')[0] ?? url;
  const anything = accepts === '' || accepts.includes('*/*');
  return anything && !/\.[A-Za-z0-9]+$/.test(pathname);
};

const isAdminPath = (url: string) => url === '/admin' || url.startsWith('/admin/');

/** Vite puts content-hashed files in assets/: cache forever. Everything else revalidates. */
const setCacheHeaders = (reply: FastifyReply, filePath: string) => {
  reply.header(
    'cache-control',
    filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
};

/**
 * Serves the portal build at / and the admin build at /admin/ from this process.
 * Returns the SPA fallback for the not-found handler: unknown non-API GETs get index.html.
 */
export async function registerStatic(
  app: FastifyInstance,
  dirs: { portal: string; admin: string } = defaultStaticDirs,
) {
  for (const [name, dir] of Object.entries(dirs)) {
    if (!existsSync(dir))
      throw new Error(`SERVE_STATIC is on but ${name} build is missing: ${dir}`);
  }

  await app.register(fastifyStatic, {
    root: dirs.portal,
    prefix: '/',
    index: ['index.html'],
    // The portal build ships .br and .gz copies of its text files (see apps/portal/vite.config.ts).
    preCompressed: true,
    setHeaders: setCacheHeaders,
  });
  await app.register(fastifyStatic, {
    root: dirs.admin,
    prefix: '/admin/',
    index: ['index.html'],
    redirect: true,
    decorateReply: false,
    preCompressed: true,
    setHeaders: setCacheHeaders,
  });

  return function spaFallback(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (isApiPath(req.url) || !wantsPage(req.url, req.headers.accept ?? '')) return false;
    reply.header('cache-control', 'no-cache');
    void reply.sendFile('index.html', isAdminPath(req.url) ? dirs.admin : dirs.portal);
    return true;
  };
}
