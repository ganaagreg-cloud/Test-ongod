import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWireGateway } from '../src/payments/wire';

// ADR-0084: an empty WIRE_ALLOWED_OPERATORS sends no allowed_operators (Wire uses all enabled).
async function bodyOfFirstWireCall(operators: string[]) {
  const realFetch = globalThis.fetch;
  let sent: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent ??= JSON.parse(String(init?.body ?? '{}'));
    return new Response('{"error":{"message":"stop"}}', { status: 400 });
  }) as typeof fetch;
  try {
    const wire = createWireGateway({ WIRE_API_KEY: 'sk_test_x', WIRE_ALLOWED_OPERATORS: operators });
    await wire!
      .createCheckout({
        amountMnt: 100,
        subscriptionId: 's1',
        description: 'd',
        successUrl: 'https://x/s',
        cancelUrl: 'https://x/c',
      })
      .catch(() => undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

test('no operator list is sent when none is configured', async () => {
  const body = await bodyOfFirstWireCall([]);
  assert.ok(body, 'Wire was not called');
  assert.equal('allowed_operators' in body, false);
});

test('the configured operator ids are sent', async () => {
  const body = await bodyOfFirstWireCall(['qpay']);
  assert.deepEqual(body?.allowed_operators, ['qpay']);
});
