import {
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

/** "Төлсөн": multipart with the optional receipt image. */
export const submitPayment = (
  id: string,
  fields: { transferAt: string; payerNote?: string },
  receipt?: File,
) => {
  const form = new FormData();
  form.append('transferAt', fields.transferAt);
  if (fields.payerNote) form.append('payerNote', fields.payerNote);
  if (receipt) form.append('receipt', receipt);
  return api(`/subscriptions/${id}/submitted`, {
    method: 'POST',
    form,
    schema: z.object({ subscription: subscriptionSchema }),
  });
};
