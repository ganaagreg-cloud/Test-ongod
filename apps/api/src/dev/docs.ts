// DEV ONLY. Interactive API docs at /docs, built from the zod schemas in packages/shared.
//
// Never part of a production build: server.ts imports this file only when
// process.env.NODE_ENV === 'development', and tsup replaces that expression with
// "production" at build time, so the bundler drops the import. The two swagger packages are
// devDependencies. `pnpm --filter @ongod/api build` + grep for "swagger" in dist/ proves it.
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@ongod/shared';
import { ROUTE_DOCS, type DocAuth, type RouteDoc } from './doc-schemas';

type JsonSchema = Record<string, unknown>;

const toJson = (schema: z.ZodType, io: 'input' | 'output'): JsonSchema => {
  const json = z.toJSONSchema(schema, {
    target: 'draft-7',
    io,
    // Trim/lowercase/preprocess steps cannot be drawn; show the field without them.
    unrepresentable: 'any',
  }) as JsonSchema;
  delete json.$schema;
  return json;
};

const AUTH_NOTE: Record<DocAuth, string> = {
  none: 'No login needed.',
  user: '**Needs:** a signed-in user (Authorize with the `accessToken`).',
  pending: '**Needs:** a signed-in user; also works while the profile is incomplete.',
  admin:
    '**Needs:** a signed-in ADMIN or OWNER. TOTP not required yet (this is where you set it up).',
  adminTotp:
    '**Needs:** ADMIN or OWNER **and** a session that passed TOTP: log in, `POST /v1/admin/totp/setup`, then `POST /v1/admin/totp/verify` (get the code with `pnpm dev:totp`).',
  cron: '**Needs:** header `X-Cron-Secret`.',
};

const INTRO = `
Dev-only preview. Everything here runs against your local database.

**Try it:** \`POST /v1/auth/login\` with a seeded user, copy \`accessToken\` from the response, click **Authorize**, paste it.

Seeded users (password = the \`SEED_*_PASSWORD\` values in your \`.env\`; owner uses \`SEED_OWNER_PASSWORD\`, all others \`SEED_USER_PASSWORD\`):

| username | what it is |
|---|---|
| \`owner\` | OWNER (admin). First admin login needs TOTP setup |
| \`bat\` | member, active access |
| \`demo\` | member, active access (store-reviewer demo account) |
| \`saraa\` | member, payment submitted (waiting in the admin queue) |
| \`tuya\` | member, access expired |
| \`temuujin\` | member, never subscribed |
| \`disabled\` | DISABLED account |

\`deviceId\`: any string of 8+ characters. Max 2 devices per user.
Emails (verification codes) arrive in Mailpit at http://localhost:8025.
`;

/**
 * Registers swagger + swagger-ui. Must run BEFORE the routes are registered, because swagger
 * collects routes as they are added. `missing()` lists routes that have no entry in
 * ROUTE_DOCS (a test fails on any).
 */
export function createDocs() {
  const missing = new Set<string>();

  async function register(app: FastifyInstance) {
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: { title: 'Онгод API (dev)', version: '0.0.0', description: INTRO },
        servers: [{ url: '/' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      transform({ schema, url, route }) {
        const method = String(route.method);
        // HEAD twins of GET routes and the docs' own routes are noise.
        if (method.includes('HEAD') || route.url.startsWith('/docs'))
          return { schema: { ...schema, hide: true }, url };

        const key = `${method} ${route.url}`;
        const doc: RouteDoc | undefined = ROUTE_DOCS[key];
        if (!doc) {
          missing.add(key);
          return { schema, url };
        }
        return { schema: describe(doc), url };
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { persistAuthorization: true, docExpansion: 'list', tryItOutEnabled: true },
      // helmet's policy blocks Swagger UI's own scripts; this is the UI's recommended one.
      staticCSP: true,
    });
  }

  return { register, missing: () => [...missing].sort() };
}

function describe(doc: RouteDoc) {
  const schema: Record<string, unknown> = {
    tags: [doc.tag],
    summary: doc.summary,
    description: [doc.description, AUTH_NOTE[doc.auth]].filter(Boolean).join('\n\n'),
  };

  if (
    doc.auth === 'user' ||
    doc.auth === 'pending' ||
    doc.auth === 'admin' ||
    doc.auth === 'adminTotp'
  ) {
    schema.security = [{ bearerAuth: [] }];
  }
  if (doc.auth === 'cron') {
    schema.headers = {
      type: 'object',
      properties: { 'x-cron-secret': { type: 'string', description: 'CRON_SECRET from .env' } },
      required: ['x-cron-secret'],
    };
  }
  if (doc.body) schema.body = toJson(doc.body, 'input');
  if (doc.query) schema.querystring = toJson(doc.query, 'input');
  if (doc.multipart) {
    const fields = toJson(doc.multipart.fields, 'input') as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    schema.consumes = ['multipart/form-data'];
    schema.body = {
      type: 'object',
      properties: {
        ...fields.properties,
        [doc.multipart.file]: { type: 'string', format: 'binary' },
      },
      required: fields.required ?? [],
    };
  }

  const response: Record<string, unknown> = {};
  for (const [status, body] of Object.entries(doc.responses)) {
    response[status] = body
      ? toJson(body, 'output')
      : { description: doc.contentType ? `${doc.contentType}` : 'No content', type: 'null' };
  }
  // The same error shape everywhere (CLAUDE.md): { error: { code, message } }.
  response.default = { description: 'Error', ...toJson(errorResponseSchema, 'output') };
  schema.response = response;

  return schema;
}
