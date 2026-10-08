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
    setHeaders: setCacheHeaders,
  });
  await app.register(fastifyStatic, {
    root: dirs.admin,
    prefix: '/admin/',
    index: ['index.html'],
    redirect: true,
    decorateReply: false,
    setHeaders: setCacheHeaders,
  });

  return function spaFallback(req: FastifyRequest, reply: FastifyReply): boolean {
    const accepts = req.headers.accept ?? '';
    if (req.method !== 'GET' || isApiPath(req.url) || !accepts.includes('text/html')) return false;
    reply.header('cache-control', 'no-cache');
    void reply.sendFile('index.html', isAdminPath(req.url) ? dirs.admin : dirs.portal);
    return true;
  };
}
