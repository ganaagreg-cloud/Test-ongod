import {
  giftResponseSchema,
  giftsResponseSchema,
  redeemGiftResponseSchema,
  createSubscriptionResponseSchema,
  currentSubscriptionResponseSchema,
  loginResponseSchema,
  meResponseSchema,
  plansResponseSchema,
  registerResponseSchema,
  subscriptionSchema,
  type LoginRequest,
  type RegisterRequest,
} from '@ongod/shared';
import { z } from 'zod';
import { api, deviceId } from './client';

/** Every call the portal makes, typed with the shared zod schemas. */

export const getPlans = () => api('/plans', { schema: plansResponseSchema, auth: false });

export const register = (input: RegisterRequest) =>
  api('/auth/register', {
    method: 'POST',
    body: input,
    schema: registerResponseSchema,
    auth: false,
  });

export const verifyEmail = (email: string, code: string) =>
  api('/auth/verify-email', { method: 'POST', body: { email, code }, auth: false });

export const resendCode = (email: string) =>
  api('/auth/resend-code', { method: 'POST', body: { email }, auth: false });

export const forgotPassword = (email: string) =>
  api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });

export const resetPassword = (email: string, code: string, newPassword: string) =>
  api('/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
    auth: false,
  });

/** `platform: "web"` makes the API put the refresh token in the httpOnly cookie. */
export const login = (
  identifier: string,
  password: string,
  removeDeviceId?: string,
): Promise<z.infer<typeof loginResponseSchema>> => {
  const body: LoginRequest = {
    identifier,
    password,
    deviceId: deviceId(),
    platform: 'web',
    ...(removeDeviceId ? { removeDeviceId } : {}),
  };
  return api('/auth/login', {
    method: 'POST',
    body,
    schema: loginResponseSchema,
    auth: false,
  });
};

export const logout = () => api('/auth/logout', { method: 'POST', body: {}, auth: false });

export const getMe = () => api('/me', { schema: meResponseSchema });

export const deleteAccount = () => api('/me', { method: 'DELETE' });

export const createSubscription = (planId: string) =>
  api('/subscriptions', {
    method: 'POST',
    body: { planId },
    schema: createSubscriptionResponseSchema,
  });

export const getCurrentSubscription = (signal?: AbortSignal) =>
  api('/subscriptions/current', {
    schema: currentSubscriptionResponseSchema,
    ...(signal ? { signal } : {}),
  });

/** Development only: the mock checkout's two buttons (the API answers 404 in production). */
export const mockPayment = (id: string, outcome: 'success' | 'cancel') =>
  api(`/subscriptions/${id}/mock`, {
    method: 'POST',
    body: { outcome },
    schema: z.object({ subscription: subscriptionSchema }),
  });

// ---- Gifts (SPEC J, ADR-0060) ----

export const createGift = (planId: string) =>
  api('/gifts', { method: 'POST', body: { planId }, schema: giftResponseSchema });

export const getMyGifts = (signal?: AbortSignal) =>
  api('/gifts', { schema: giftsResponseSchema, ...(signal ? { signal } : {}) });

export const redeemGift = (code: string) =>
  api('/gifts/redeem', { method: 'POST', body: { code }, schema: redeemGiftResponseSchema });

/** Development only: the mock checkout's two buttons for a gift (404 in production). */
export const mockGiftPayment = (id: string, outcome: 'success' | 'cancel') =>
  api(`/gifts/${id}/mock`, { method: 'POST', body: { outcome } });
