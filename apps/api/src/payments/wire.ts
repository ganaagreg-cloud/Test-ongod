import { SIGNATURE_HEADER, Webhooks, Wire } from '@buildry-wire/wire';
import type { Env } from '../env';

/** Wire (api.wire.mn): the payment gateway; QPay is one of its operators (ADR-0041, [[R-wire-qpay-gateway]]). */

export { SIGNATURE_HEADER };

export interface WireIntent {
  id: string;
  status: string;
  /** In the unit `toMinor` produces. */
  amount: number;
  livemode: boolean;
}

export interface WireGateway {
  /** Creates the payment intent and the hosted checkout page; safe to repeat for one subscription. */
  createCheckout(input: {
    subscriptionId: string;
    amountMnt: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ paymentIntentId: string; checkoutUrl: string }>;
  retrieveIntent(id: string): Promise<WireIntent>;
}

/**
 * TEMPORARY WORKAROUND (reported by the owner, 2026-09-25, on dearlove.mn): Wire's docs say MNT
 * amounts are minor units (x100), but a real live QPay checkout charged the raw number: 10000
 * sent for a 100 MNT price made a 10,000 MNT invoice. Until Wire confirms a fix we send whole
 * MNT so real charges match our prices. Used both when creating the intent and when checking the
 * amount of a paid one, so the two can never disagree.
 * LAUNCH GATE: make one small live payment and check the charged amount on the bank statement.
 * If Wire has fixed it, switch to `Math.round(mnt) * 100` (flipping it too early silently
 * undercharges 100 times).
 */
export const toMinor = (mnt: number) => Math.round(mnt);

export const isSucceeded = (intent: Pick<WireIntent, 'status'>) => intent.status === 'succeeded';
export const isDead = (intent: Pick<WireIntent, 'status'>) =>
  intent.status === 'canceled' || intent.status === 'failed';

/** The real gateway, or null when no API key is set (development: the mock checkout is used). */
export function createWireGateway(
  env: Pick<Env, 'WIRE_API_KEY' | 'WIRE_ALLOWED_OPERATORS'>,
): WireGateway | null {
  if (!env.WIRE_API_KEY) return null;
  const wire = new Wire(env.WIRE_API_KEY, { timeoutMs: 15_000, maxRetries: 2 });
  return {
    async createCheckout(input) {
      const intent = await wire.paymentIntents.create({
        amount: toMinor(input.amountMnt),
        currency: 'MNT',
        allowed_operators: env.WIRE_ALLOWED_OPERATORS,
        metadata: {
          subscription_id: input.subscriptionId,
          description: input.description.slice(0, 200),
        },
        idempotencyKey: `pi-${input.subscriptionId}`,
      });
      const session = await wire.request<{ id: string; url: string }>(
        'POST',
        '/v1/checkout/sessions',
        {
          body: {
            payment_intent: intent.id,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
          },
          idempotencyKey: `cs-${input.subscriptionId}`,
        },
      );
      return { paymentIntentId: intent.id, checkoutUrl: session.url };
    },
    async retrieveIntent(id) {
      const intent = await wire.paymentIntents.retrieve(id);
      return {
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        livemode: intent.livemode,
      };
    },
  };
}

export interface VerifiedWebhook {
  eventId: string;
  type: string;
  /** The payment intent the event is about, if the payload carries one. */
  intentId: string | null;
}

/** Checks the signature on the RAW body (the SDK does the HMAC), then reads what we need. Throws if it is wrong. */
export function verifyWebhook(rawBody: string, header: string, secret: string): VerifiedWebhook {
  const event = new Webhooks().verify(rawBody, header, secret);
  const object = (event.data as { object?: { id?: unknown } }).object ?? event.data;
  const id = (object as { id?: unknown }).id;
  return { eventId: event.id, type: event.type, intentId: typeof id === 'string' ? id : null };
}
