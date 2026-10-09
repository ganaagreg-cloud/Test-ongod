import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDocs } from '../src/dev/docs';
import { ROUTE_DOCS } from '../src/dev/doc-schemas';
import { testApp, testEnv } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Every optional route group on, so every route exists. */
const allRoutes = testEnv({
  SOCIAL_LOGIN: 'true',
  GOOGLE_CLIENT_IDS: 'google-client',
  APPLE_CLIENT_IDS: 'apple-client',
});

async function docsApp() {
  const docs = createDocs();
  app = await testApp({
    env: allRoutes,
    registerDocs: docs.register,
    socialVerifiers: { google: async () => ({}) as never, apple: async () => ({}) as never },
  });
  await app.ready();
  return { app, docs };
}

describe('API docs (development only)', () => {
  it('documents every route: a new route without an entry in dev/doc-schemas.ts fails here', async () => {
    const { app, docs } = await docsApp();
    app.swagger(); // builds the spec; the transform records routes it cannot find
    expect(docs.missing()).toEqual([]);
  });

  it('has no entry for a route that does not exist (stale docs)', async () => {
    const { app } = await docsApp();
    const spec = app.swagger() as { paths: Record<string, Record<string, unknown>> };
    const documented = new Set(
      Object.entries(spec.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
      ),
    );
    const stale = Object.keys(ROUTE_DOCS).filter((key) => !documented.has(key));
    expect(stale).toEqual([]);
  });

  it('serves the UI and the spec at /docs', async () => {
    const { app } = await docsApp();
    const page = await app.inject({ url: '/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    const json = await app.inject({ url: '/docs/json' });
    expect(json.statusCode).toBe(200);
    expect(json.json().openapi).toMatch(/^3\./);
  });

  it('shows the zod schemas: login body, bearer auth on protected routes, error shape', async () => {
    const { app } = await docsApp();
    const spec = (await app.inject({ url: '/docs/json' })).json();

    const login = spec.paths['/v1/auth/login'].post;
    expect(login.requestBody.content['application/json'].schema.properties).toHaveProperty(
      'identifier',
    );
    expect(login.requestBody.content['application/json'].schema.required).toEqual(
      expect.arrayContaining(['identifier', 'password', 'deviceId', 'platform']),
    );
    expect(login.security).toBeUndefined();

    expect(spec.paths['/v1/me'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths['/v1/admin/dashboard'].get.description).toMatch(/TOTP/);
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    const err = spec.paths['/v1/me'].get.responses.default.content['application/json'].schema;
    expect(err.properties.error.properties).toHaveProperty('code');

    const upload = spec.paths['/v1/subscriptions/{id}/submitted'].post.requestBody.content;
    expect(upload['multipart/form-data'].schema.properties.receipt).toMatchObject({
      format: 'binary',
    });

    // Query parameters come from the zod query schemas.
    const names = spec.paths['/v1/admin/subscriptions'].get.parameters.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual(expect.arrayContaining(['status', 'q', 'page', 'limit']));
  });

  it('is absent unless the dev entry point asks for it: no /docs in a normal app', async () => {
    app = await testApp();
    for (const url of ['/docs', '/docs/', '/docs/json']) {
      expect((await app.inject({ url })).statusCode, url).toBe(404);
    }
  });
});
