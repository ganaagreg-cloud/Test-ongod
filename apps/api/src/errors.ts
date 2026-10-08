import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorResponse } from '@ongod/shared';
import { mn } from './i18n/mn';
import type { HttpErrorInfo } from './monitoring/alerts';

/** Called for unexpected (5xx) request errors: Sentry and/or alert emails. */
export type HttpErrorReporter = (err: unknown, info: HttpErrorInfo) => void;

/** Throw this from handlers for expected failures; the error handler renders it. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode | (string & {}),
    message?: string,
  ) {
    super(message ?? (mn.errors as Record<string, string>)[code] ?? code);
  }
}

export const errorBody = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

const codeForStatus = (status: number): ErrorCode => {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
};

/**
 * Maps any thrown error to { error: { code, message } }. 5xx details are logged and
 * reported, never sent to the client.
 */
export function toErrorReply(
  err: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
  report?: HttpErrorReporter,
) {
  if (err instanceof AppError) {
    return reply.code(err.statusCode).send(errorBody(err.code, err.message));
  }
  if (err instanceof ZodError) {
    req.log.info({ issues: err.issues }, 'validation failed');
    return reply.code(400).send(errorBody('VALIDATION_ERROR', mn.errors.VALIDATION_ERROR));
  }

  const status =
    'statusCode' in err && err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    req.log.error({ err }, 'request failed');
    report?.(err, {
      requestId: req.id,
      method: req.method,
      route: req.routeOptions.url ?? '(no route)',
    });
  }
  const code = codeForStatus(status);
  return reply.code(status).send(errorBody(code, mn.errors[code]));
}
