import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppException } from '../errors/app.exception.js';
import type { ErrorCode } from '../errors/error-codes.js';

// Codes for Nest's built-in exceptions (NotFoundException, ParseUUIDPipe's 400, …).
// Services should throw AppException with a specific code instead.
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'INVALID_STATE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Turns every error into the one shape the frontend handles:
 * `{ "error": { "code": "SEAT_TAKEN", "message": "...", "details": {} } }`.
 * Anything that isn't an HttpException is a bug: it's logged and the client
 * only sees INTERNAL, so stack traces and SQL never leak.
 */
@Catch() // Leaving this empty catches absolutely everything
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: ErrorCode;
    let message: string;
    let details: Record<string, unknown> = {};

    if (exception instanceof AppException) {
      ({ code, details } = exception);
      message = exception.message;
    } else if (exception instanceof HttpException && status < 500) {
      code = CODE_BY_STATUS[status] ?? 'VALIDATION_FAILED';
      message = exception.message;
    } else {
      code = 'INTERNAL';
      message = 'Something went wrong. Please try again.';
    }

    // Set by the request logger; ties a screenshot of this error to its logs
    const request = ctx.getRequest<{
      id?: string;
      method: string;
      path: string;
    }>();
    const requestId = request.id;

    // 4xx are the client's mistake and expected; only server errors are logged.
    // The path only: query strings can carry tokens
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.path} failed (request ${requestId})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Rate limits tell the client when to come back
    const retryAfter = details.retryAfterSeconds;
    if (typeof retryAfter === 'number') {
      httpAdapter.setHeader(
        ctx.getResponse(),
        'Retry-After',
        String(retryAfter),
      );
    }

    httpAdapter.reply(
      ctx.getResponse(),
      { error: { code, message, details, requestId } },
      status,
    );
  }
}
