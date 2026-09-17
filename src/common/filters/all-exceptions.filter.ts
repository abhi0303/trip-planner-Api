import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Single error shape for the whole API:
 *   { success:false, statusCode, error:{ code, message, details }, path, timestamp }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error: { code, message, ...(details ? { details } : {}) },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return { status, code: this.codeFor(status), message: body };
      }

      const record = body as Record<string, any>;
      // ValidationPipe puts an array of messages here; group them by field.
      if (Array.isArray(record.message)) {
        return {
          status,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: record.message,
        };
      }
      return {
        status,
        code: record.code ?? this.codeFor(status),
        message: record.message ?? exception.message,
        details: record.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_QUERY',
        message: 'The request could not be processed with the given values',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError) {
    const target = (e.meta?.target as string[] | string | undefined) ?? undefined;
    const field = Array.isArray(target) ? target.join(', ') : target;

    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: field ? `${field} is already taken` : 'Resource already exists',
          details: field ? { fields: field } : undefined,
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Resource not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'INVALID_REFERENCE',
          message: 'Referenced resource does not exist',
          details: field ? { fields: field } : undefined,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: `DB_${e.code}`,
          message: 'Database error',
        };
    }
  }

  private codeFor(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
      501: 'NOT_IMPLEMENTED',
    };
    return map[status] ?? 'ERROR';
  }
}
