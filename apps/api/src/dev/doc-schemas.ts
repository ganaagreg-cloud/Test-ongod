// DEV ONLY (see dev/docs.ts). What /docs shows for each route: the zod schemas from
// packages/shared. The routes themselves validate with zod inside the handler, so nothing
// here changes how the API behaves; a test fails when a route has no entry.
import {
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminEpisodeResponseSchema,
  adminEpisodesPageSchema,
  createCategoryRequestSchema,
  createEpisodeRequestSchema,
  historyResponseSchema,
  listAdminEpisodesQuerySchema,
  reorderCategoriesRequestSchema,
  scheduleRequestSchema,
  updateCategoryRequestSchema,
  updateEpisodeRequestSchema,
  adminSubscriptionResponseSchema,
  adminSubscriptionsPageSchema,
  adminUserDetailResponseSchema,
  adminUsersPageSchema,
  appConfigResponseSchema,
  appleLoginRequestSchema,
  auditPageSchema,
  categoriesResponseSchema,
  changeEmailRequestSchema,
  changeEmailVerifyRequestSchema,
  changePasswordRequestSchema,
  completeProfileRequestSchema,
  completeProfileResponseSchema,
  createSubscriptionRequestSchema,
  createSubscriptionResponseSchema,
  currentSubscriptionResponseSchema,
  dashboardResponseSchema,
  devicesResponseSchema,
  episodeDetailResponseSchema,
  episodesPageSchema,
  exportPaymentsQuerySchema,
  forgotPasswordRequestSchema,
  googleLoginRequestSchema,
  grantRequestSchema,
  homeResponseSchema,
  identitiesResponseSchema,
  linkAppleRequestSchema,
  linkGoogleRequestSchema,
  linkResponseSchema,
  listAuditQuerySchema,
  listEpisodesQuerySchema,
  listSavedQuerySchema,
  listSubscriptionsQuerySchema,
  listUsersQuerySchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  meResponseSchema,
  plansResponseSchema,
  playResponseSchema,
  refreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  pushTokenRequestSchema,
  rejectRequestSchema,
  removeDeviceRequestSchema,
  resendCodeRequestSchema,
  resetPasswordRequestSchema,
  revokeRequestSchema,
  saveProgressRequestSchema,
  subscriptionSchema,
  tokenPairSchema,
  totpSetupResponseSchema,
  totpStatusResponseSchema,
  totpVerifyRequestSchema,
  verifyEmailRequestSchema,
} from '@ongod/shared';
import { z } from 'zod';

export type DocAuth = 'none' | 'user' | 'pending' | 'admin' | 'adminTotp' | 'cron';

export interface RouteDoc {
  tag: string;
  summary: string;
  description?: string;
  auth: DocAuth;
  body?: z.ZodType;
  query?: z.ZodType;
  /** Success responses by status; `null` = no content. */
  responses: Record<number, z.ZodType | null>;
  /** File upload form instead of a JSON body. */
  multipart?: { fields: z.ZodType; file: string };
  /** Plain-text responses (CSV). */
  contentType?: string;
}

const noContent = null;
const user = (
  tag: string,
  summary: string,
  rest: Partial<RouteDoc> & Pick<RouteDoc, 'responses'>,
): RouteDoc => ({
  tag,
  summary,
  auth: 'user',
  ...rest,
});
const admin = (
  summary: string,
  rest: Partial<RouteDoc> & Pick<RouteDoc, 'responses'>,
): RouteDoc => ({
  tag: 'admin',
  summary,
  auth: 'adminTotp',
  ...rest,
});

const submitFields = z.object({
  transferAt: z.iso.datetime({ offset: true }),
  payerNote: z.string().max(1000).optional(),
});

/** Key = `METHOD /full/path` exactly as Fastify registers it. */
export const ROUTE_DOCS: Record<string, RouteDoc> = {
  // ---- system ----
  'GET /health': {
    tag: 'system',
    summary: 'Process and database are up',
    auth: 'none',
    responses: { 200: z.object({ status: z.literal('ok') }) },
  },
  'GET /v1/app-config': {
    tag: 'system',
    summary: 'Config the mobile app reads on start (min versions, flags). Never prices.',
    auth: 'none',
    responses: { 200: appConfigResponseSchema },
  },
  'POST /v1/cron/tick': {
    tag: 'system',
    summary: 'Runs the scheduled tasks and drains due jobs',
    description: 'Header `X-Cron-Secret` must equal CRON_SECRET from .env.',
    auth: 'cron',
    responses: {
      200: z.object({
        tasks: z.record(z.string(), z.unknown()),
        jobsProcessed: z.number(),
      }),
    },
  },

  // ---- auth (A, B, H) ----
  'POST /v1/auth/register': {
    tag: 'auth',
    summary: 'A. Register; a 6-digit code is emailed (see Mailpit)',
    auth: 'none',
    body: registerRequestSchema,
    responses: { 201: registerResponseSchema },
  },
  'POST /v1/auth/verify-email': {
    tag: 'auth',
    summary: 'A. Verify the email with the code',
    auth: 'none',
    body: verifyEmailRequestSchema,
    responses: { 204: noContent },
  },
  'POST /v1/auth/resend-code': {
    tag: 'auth',
    summary: 'A. Send a new verification code (60 s cooldown)',
    auth: 'none',
    body: resendCodeRequestSchema,
    responses: { 204: noContent },
  },
  'POST /v1/auth/login': {
    tag: 'auth',
    summary: 'B. Log in with username or email + password + deviceId',
    description:
      'Copy `accessToken` from the response into the **Authorize** button. Max 2 devices: use a different `deviceId` (8+ characters) per try, or the 3rd one gets DEVICE_LIMIT.',
    auth: 'none',
    body: loginRequestSchema,
    responses: { 200: loginResponseSchema },
  },
  'POST /v1/auth/refresh': {
    tag: 'auth',
    summary: 'B. Rotate the refresh token',
    auth: 'none',
    body: refreshRequestSchema,
    responses: { 200: tokenPairSchema },
  },
  'POST /v1/auth/logout': {
    tag: 'auth',
    summary: 'B. Log out this device (by refresh token)',
    auth: 'none',
    body: logoutRequestSchema,
    responses: { 204: noContent },
  },
  'POST /v1/auth/forgot-password': {
    tag: 'auth',
    summary: 'H. Email a password reset code',
    auth: 'none',
    body: forgotPasswordRequestSchema,
    responses: { 204: noContent },
  },
  'POST /v1/auth/reset-password': {
    tag: 'auth',
    summary: 'H. Set a new password with the emailed code',
    auth: 'none',
    body: resetPasswordRequestSchema,
    responses: { 204: noContent },
  },

  // ---- social login (C), only when SOCIAL_LOGIN=true ----
  'POST /v1/auth/google': {
    tag: 'auth',
    summary: 'C. Log in with a Google ID token (SOCIAL_LOGIN)',
    auth: 'none',
    body: googleLoginRequestSchema,
    responses: { 200: loginResponseSchema },
  },
  'POST /v1/auth/apple': {
    tag: 'auth',
    summary: 'C. Log in with an Apple ID token (SOCIAL_LOGIN)',
    auth: 'none',
    body: appleLoginRequestSchema,
    responses: { 200: loginResponseSchema },
  },
  'POST /v1/auth/complete-profile': {
    tag: 'auth',
    summary: 'C. Complete the profile after a first social login',
    auth: 'pending',
    body: completeProfileRequestSchema,
    responses: { 200: completeProfileResponseSchema },
  },

  // ---- me (H) ----
  'GET /v1/me': user('me', 'The signed-in user', {
    auth: 'pending',
    responses: { 200: meResponseSchema },
  }),
  'POST /v1/me/change-password': user('me', 'H. Change password', {
    body: changePasswordRequestSchema,
    responses: { 204: noContent },
  }),
  'POST /v1/me/change-email': user(
    'me',
    'H. Start an email change (code goes to the new address)',
    {
      body: changeEmailRequestSchema,
      responses: { 204: noContent },
    },
  ),
  'POST /v1/me/change-email/verify': user('me', 'H. Finish the email change with the code', {
    body: changeEmailVerifyRequestSchema,
    responses: { 200: meResponseSchema },
  }),
  'GET /v1/me/devices': user('me', 'Signed-in devices (max 2)', {
    responses: { 200: devicesResponseSchema },
  }),
  'PUT /v1/me/devices/current/push-token': user(
    'me',
    'Store (or clear) the push token of this device',
    { body: pushTokenRequestSchema, responses: { 204: noContent } },
  ),
  'DELETE /v1/me/devices/:id': user('me', 'Remove a device (needs the password)', {
    body: removeDeviceRequestSchema,
    responses: { 204: noContent },
  }),
  'DELETE /v1/me': user('me', 'H. Delete the account (soft delete, anonymises personal data)', {
    responses: { 204: noContent },
  }),
  'POST /v1/me/link/google': user('me', 'C. Link a Google account (SOCIAL_LOGIN)', {
    body: linkGoogleRequestSchema,
    responses: { 200: linkResponseSchema },
  }),
  'POST /v1/me/link/apple': user('me', 'C. Link an Apple account (SOCIAL_LOGIN)', {
    body: linkAppleRequestSchema,
    responses: { 200: linkResponseSchema },
  }),
  'GET /v1/me/identities': user('me', 'C. Linked Google/Apple accounts (SOCIAL_LOGIN)', {
    responses: { 200: identitiesResponseSchema },
  }),
  'DELETE /v1/me/identities/:id': user('me', 'C. Unlink a Google/Apple account (SOCIAL_LOGIN)', {
    responses: { 204: noContent },
  }),

  // ---- catalog and playback (G) ----
  'GET /v1/categories': user('catalog', 'Categories', {
    responses: { 200: categoriesResponseSchema },
  }),
  'GET /v1/episodes': user('catalog', 'Published episodes (search, category, sort, cursor)', {
    query: listEpisodesQuerySchema,
    responses: { 200: episodesPageSchema },
  }),
  'GET /v1/episodes/:id': user('catalog', 'One episode with the next one', {
    responses: { 200: episodeDetailResponseSchema },
  }),
  'GET /v1/home': user('catalog', 'Home rows', { responses: { 200: homeResponseSchema } }),
  'POST /v1/episodes/:id/play': user('catalog', 'Signed audio URL; needs active access', {
    description:
      'Without access: 403 NO_ACCESS. Needs a registered device (the one you logged in on).',
    responses: { 200: playResponseSchema },
  }),
  'PUT /v1/progress/:episodeId': user('catalog', 'Save the listening position', {
    body: saveProgressRequestSchema,
    responses: { 204: noContent },
  }),
  'PUT /v1/saved/:episodeId': user('catalog', 'Save an episode', { responses: { 204: noContent } }),
  'DELETE /v1/saved/:episodeId': user('catalog', 'Remove a saved episode', {
    responses: { 204: noContent },
  }),
  'GET /v1/saved': user('catalog', 'Saved episodes', {
    query: listSavedQuerySchema,
    responses: { 200: episodesPageSchema },
  }),

  // ---- subscribe (D), portal only ----
  'GET /v1/plans': {
    tag: 'portal',
    summary: 'D. Active plans and prices. Public (landing page); never shown in the apps',
    auth: 'none',
    responses: { 200: plansResponseSchema },
  },
  'POST /v1/subscriptions': user(
    'portal',
    'D. Apply for a plan (verified email, one open request)',
    {
      body: createSubscriptionRequestSchema,
      responses: { 201: createSubscriptionResponseSchema },
    },
  ),
  'GET /v1/subscriptions/current': user(
    'portal',
    'D. The open request or the latest subscription',
    {
      responses: { 200: currentSubscriptionResponseSchema },
    },
  ),
  'POST /v1/subscriptions/:id/submitted': user(
    'portal',
    'D. "Төлсөн": payer note, transfer time, optional receipt',
    {
      description: 'multipart/form-data. `receipt`: JPEG, PNG or WebP, at most 5 MB.',
      multipart: { fields: submitFields, file: 'receipt' },
      responses: { 200: z.object({ subscription: subscriptionSchema }) },
    },
  ),

  // ---- admin (E) ----
  'GET /v1/admin/totp': {
    tag: 'admin',
    summary: 'TOTP status of this account and session',
    auth: 'admin',
    responses: { 200: totpStatusResponseSchema },
  },
  'POST /v1/admin/totp/setup': {
    tag: 'admin',
    summary: 'Start TOTP setup: secret + otpauth URI for the authenticator app',
    description: 'Dev shortcut for the current code: `pnpm dev:totp`.',
    auth: 'admin',
    responses: { 200: totpSetupResponseSchema },
  },
  'POST /v1/admin/totp/verify': {
    tag: 'admin',
    summary: 'Verify a code: enables TOTP the first time and unlocks this session',
    auth: 'admin',
    body: totpVerifyRequestSchema,
    responses: { 204: noContent },
  },
  'GET /v1/admin/dashboard': admin('Dashboard counts', {
    responses: { 200: dashboardResponseSchema },
  }),
  'GET /v1/admin/subscriptions': admin(
    'Payments queue (default PAYMENT_SUBMITTED), search, paging',
    {
      query: listSubscriptionsQuerySchema,
      responses: { 200: adminSubscriptionsPageSchema },
    },
  ),
  'GET /v1/admin/subscriptions/:id': admin('One subscription', {
    responses: { 200: adminSubscriptionResponseSchema },
  }),
  'GET /v1/admin/subscriptions/:id/receipt': admin('Receipt image (admin only)', {
    contentType: 'image/*',
    responses: { 200: null },
  }),
  'POST /v1/admin/subscriptions/:id/approve': admin(
    'E. Approve: period, Payment, access, email + push, audit',
    {
      responses: { 200: adminSubscriptionResponseSchema },
    },
  ),
  'POST /v1/admin/subscriptions/:id/reject': admin('E. Reject with a reason (emails the user)', {
    body: rejectRequestSchema,
    responses: { 200: adminSubscriptionResponseSchema },
  }),
  'POST /v1/admin/subscriptions/:id/revoke': admin(
    'E. Revoke an ACTIVE subscription (refund / fraud)',
    {
      body: revokeRequestSchema,
      responses: { 200: adminSubscriptionResponseSchema },
    },
  ),
  'GET /v1/admin/users': admin('Users, search', {
    query: listUsersQuerySchema,
    responses: { 200: adminUsersPageSchema },
  }),
  'GET /v1/admin/users/:id': admin('User detail: profile, devices, subscriptions, audit', {
    responses: { 200: adminUserDetailResponseSchema },
  }),
  'POST /v1/admin/users/:id/grants': admin('E. Manual grant (gift, store-reviewer demo account)', {
    body: grantRequestSchema,
    responses: { 201: adminSubscriptionResponseSchema },
  }),
  'GET /v1/admin/audit': admin('Audit log', {
    query: listAuditQuerySchema,
    responses: { 200: auditPageSchema },
  }),
  'GET /v1/admin/payments.csv': admin('CSV export of payments', {
    query: exportPaymentsQuerySchema,
    contentType: 'text/csv',
    responses: { 200: null },
  }),
  'GET /v1/admin/subscriptions/:id/history': admin('What the admins did to one subscription', {
    responses: { 200: historyResponseSchema },
  }),

  // ---- admin content (G) ----
  'GET /v1/admin/categories': admin('Categories with episode counts, in order', {
    responses: { 200: adminCategoriesResponseSchema },
  }),
  'POST /v1/admin/categories': admin('Create a category', {
    body: createCategoryRequestSchema,
    responses: { 201: adminCategoryResponseSchema },
  }),
  'POST /v1/admin/categories/reorder': admin('Set the order: every category id, first to last', {
    body: reorderCategoriesRequestSchema,
    responses: { 200: adminCategoriesResponseSchema },
  }),
  'PATCH /v1/admin/categories/:id': admin('Rename a category or change its slug', {
    body: updateCategoryRequestSchema,
    responses: { 200: adminCategoryResponseSchema },
  }),
  'DELETE /v1/admin/categories/:id': admin('Delete an empty category', {
    responses: { 204: noContent },
  }),
  'GET /v1/admin/episodes': admin('Episodes: status, category, search, paging', {
    query: listAdminEpisodesQuerySchema,
    responses: { 200: adminEpisodesPageSchema },
  }),
  'POST /v1/admin/episodes': admin('Create a draft episode', {
    body: createEpisodeRequestSchema,
    responses: { 201: adminEpisodeResponseSchema },
  }),
  'GET /v1/admin/episodes/:id': admin('One episode with its media status', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'PATCH /v1/admin/episodes/:id': admin('Edit title, description or category', {
    body: updateEpisodeRequestSchema,
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'DELETE /v1/admin/episodes/:id': admin(
    'Delete a draft episode (its files are removed by a job)',
    {
      responses: { 204: noContent },
    },
  ),
  'POST /v1/admin/episodes/:id/cover': admin('Upload the cover (JPEG, PNG, WebP, up to 10 MB)', {
    description:
      'multipart/form-data, field `cover`. Resized to 16:9 (1280x720 and 400x225), then stored by a job.',
    multipart: { fields: z.object({}), file: 'cover' },
    responses: { 202: adminEpisodeResponseSchema },
  }),
  'POST /v1/admin/episodes/:id/publish': admin('Publish now (needs a cover and READY audio)', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'POST /v1/admin/episodes/:id/schedule': admin(
    'Schedule a publish time (with offset, e.g. +08:00)',
    {
      body: scheduleRequestSchema,
      responses: { 200: adminEpisodeResponseSchema },
    },
  ),
  'POST /v1/admin/episodes/:id/unschedule': admin('Back to draft', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'POST /v1/admin/episodes/:id/archive': admin('Take a published episode out of the library', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'POST /v1/admin/episodes/:id/restore': admin('Archived episode back to draft', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'POST /v1/admin/episodes/:id/media/retry': admin('Retry a FAILED audio upload', {
    responses: { 200: adminEpisodeResponseSchema },
  }),
  'DELETE /v1/admin/users/:id/devices/:deviceId': admin(
    'Remove a user device and end its sessions',
    {
      responses: { 204: noContent },
    },
  ),
};
