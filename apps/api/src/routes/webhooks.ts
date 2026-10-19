import type { FastifyInstance } from 'fastify';
import type { PaymentService } from '../payments/service';
import { SIGNATURE_HEADER } from '../payments/wire';

/**
 * POST /v1/webhooks/wire: Wire tells us a payment changed (ADR-0041). No login: the signature on
 * the RAW body is the proof, so this plugin keeps the body as a string instead of parsing it.
 */
export async function webhookRoutes(app: FastifyInstance, opts: { payments: PaymentService }) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/webhooks/wire', async (req, reply) => {
    const header = req.headers[SIGNATURE_HEADER.toLowerCase()];
    const signature = typeof header === 'string' ? header : '';
    const result = await opts.payments.handleWebhook(String(req.body ?? ''), signature);
    return reply.code(result.status).send(result.body);
  });
}
