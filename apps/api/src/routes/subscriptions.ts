import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createSubscriptionRequestSchema,
  createSubscriptionResponseSchema,
  currentSubscriptionResponseSchema,
  MAX_RECEIPT_BYTES,
  plansResponseSchema,
  subscriptionParamsSchema,
  subscriptionSchema,
  submitPaymentFieldsSchema,
} from '@ongod/shared';
import { z } from 'zod';
import { authOf, type createAuthGuard } from '../auth/guard';
import { AppError } from '../errors';
import { sniffImage, type ReceiptType } from '../subscriptions/receipts';
import type { SubscriptionService, SubmitInput } from '../subscriptions/service';

const isMultipartError = (err: unknown, code: string) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;

/** Reads the "Төлсөн" form: text fields plus an optional `receipt` image (<= 5 MB). */
async function readSubmission(req: FastifyRequest): Promise<SubmitInput> {
  if (!req.isMultipart()) {
    const body = submitPaymentFieldsSchema.parse(req.body);
    return { payerNote: body.payerNote, transferAt: body.transferAt };
  }

  const fields: Record<string, string> = {};
  let receipt: { data: Buffer; type: ReceiptType } | undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
        continue;
      }
      if (part.fieldname !== 'receipt') {
        part.file.resume();
        throw new AppError(400, 'VALIDATION_ERROR');
      }
      const data = await part.toBuffer();
      // A browser sends an empty file part when nothing was chosen.
      if (data.length === 0) continue;
      const type = sniffImage(data);
      if (!type) throw new AppError(400, 'RECEIPT_INVALID');
      receipt = { data, type };
    }
  } catch (err) {
    if (isMultipartError(err, 'FST_REQ_FILE_TOO_LARGE'))
      throw new AppError(413, 'RECEIPT_TOO_LARGE');
    if (isMultipartError(err, 'FST_PARTS_LIMIT') || isMultipartError(err, 'FST_FIELDS_LIMIT')) {
      throw new AppError(400, 'VALIDATION_ERROR');
    }
    throw err;
  }

  const parsed = submitPaymentFieldsSchema.parse(fields);
  return { payerNote: parsed.payerNote, transferAt: parsed.transferAt, receipt };
}

/** /v1/plans and /v1/subscriptions: the portal side of SPEC D. Never called by the mobile apps. */
export async function subscriptionRoutes(
  app: FastifyInstance,
  opts: { subscriptions: SubscriptionService; requireAuth: ReturnType<typeof createAuthGuard> },
) {
  const { subscriptions } = opts;

  // Public: the landing page shows the plan and its price before anyone signs up. The mobile
  // apps never call it (ADR-0006), and /v1/app-config still carries no prices.
  app.get('/plans', async () =>
    plansResponseSchema.parse({ plans: await subscriptions.listPlans() }),
  );

  await app.register(async (authed) => {
    authed.addHook('preHandler', opts.requireAuth);
    await authed.register(multipart, {
      limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 5, fieldSize: 4096, parts: 8 },
    });

    authed.post('/subscriptions', async (req, reply) => {
      const body = createSubscriptionRequestSchema.parse(req.body);
      const created = await subscriptions.create(authOf(req).user, body.planId);
      return reply.code(201).send(createSubscriptionResponseSchema.parse(created));
    });

    authed.get('/subscriptions/current', async (req) =>
      currentSubscriptionResponseSchema.parse(await subscriptions.current(authOf(req).user)),
    );

    authed.post('/subscriptions/:id/submitted', async (req) => {
      const { id } = subscriptionParamsSchema.parse(req.params);
      const input = await readSubmission(req);
      const subscription = await subscriptions.submitted(authOf(req).user, id, input);
      return z.object({ subscription: subscriptionSchema }).parse({ subscription });
    });
  });
}
