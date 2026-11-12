// ADR-0090: the gift calls of the app. Kept out of src/api/endpoints.ts, which must stay free of
// payment endpoints; only the screens of this folder use them.
import {
  giftResponseSchema,
  giftsResponseSchema,
  plansResponseSchema,
  redeemGiftResponseSchema,
} from '@ongod/shared';
import { client } from '../api';

export const inpayApi = {
  plans: (signal?: AbortSignal) =>
    client.request('/plans', {
      auth: false,
      schema: plansResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  gifts: (signal?: AbortSignal) =>
    client.request('/gifts', { schema: giftsResponseSchema, ...(signal ? { signal } : {}) }),
  buyGift: (planId: string) =>
    client.request('/gifts', { method: 'POST', body: { planId }, schema: giftResponseSchema }),
  redeemGift: (code: string) =>
    client.request('/gifts/redeem', {
      method: 'POST',
      body: { code },
      schema: redeemGiftResponseSchema,
    }),
};
