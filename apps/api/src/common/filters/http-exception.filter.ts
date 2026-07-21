import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorShape } from '../types';

/**
 * Serialises errors into a stable {@link ApiErrorShape}. Unknown errors are
 * logged server-side but never leak internals (stack traces, SQL) to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body: ApiErrorShape = {
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: this.extractMessage(payload),
      };
      response.status(status).json(body);
      return;
    }

    // Errors thrown outside the Nest pipeline (e.g. body-parser's
    // PayloadTooLargeError) carry a numeric status. Honour 4xx client errors
    // with a safe generic message instead of masking them as 500.
    const clientStatus = this.clientErrorStatus(exception);
    if (clientStatus !== null) {
      const body: ApiErrorShape = {
        statusCode: clientStatus,
        error: HttpStatus[clientStatus] ?? 'ERROR',
        message:
          HttpStatus[clientStatus]?.replace(/_/g, ' ') ?? 'Request error',
      };
      response.status(clientStatus).json(body);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    const body: ApiErrorShape = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  /** Extracts a 4xx status from a non-Nest error (body-parser etc.). */
  private clientErrorStatus(exception: unknown): number | null {
    if (typeof exception !== 'object' || exception === null) return null;
    const candidate = exception as { status?: unknown; statusCode?: unknown };
    const raw =
      typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : null;
    return raw !== null && raw >= 400 && raw < 500 ? raw : null;
  }

  private extractMessage(payload: string | object): string | string[] {
    if (typeof payload === 'string') return payload;
    const maybe = payload as { message?: string | string[] };
    if (maybe.message !== undefined) return maybe.message;
    return 'Error';
  }
}
