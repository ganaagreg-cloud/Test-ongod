import Fastify, { type FastifyError } from 'fastify';
import type { ErrorResponse } from '@ongod/shared';

export function buildApp() {
  const app = Fastify({ logger: true });

  // Every error leaves the API as { error: { code, message } }.
  app.setNotFoundHandler(async (_req, reply) => {
    const body: ErrorResponse = { error: { code: 'NOT_FOUND', message: 'Not found' } };
    return reply.code(404).send(body);
  });

  app.setErrorHandler<FastifyError>(async (err, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    const body: ErrorResponse = {
      error: {
        code: status >= 500 ? 'INTERNAL' : (err.code ?? 'BAD_REQUEST'),
        message: status >= 500 ? 'Internal server error' : err.message,
      },
    };
    return reply.code(status).send(body);
  });

  app.register(
    async (v1) => {
      v1.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/v1' },
  );

  // Later: portal static build at /, admin static build at /admin (one process, shared hosting).

  return app;
}
