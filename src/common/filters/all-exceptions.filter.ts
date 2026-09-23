import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

type PrismaKnownError = { code: string; meta?: Record<string, unknown> };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : (body as Record<string, unknown>).message;
      const message = Array.isArray(raw)
        ? raw.join(', ')
        : typeof raw === 'string'
          ? raw
          : exception.message;
      this.respond(response, request, status, message);
      return;
    }

    const prismaError = exception as PrismaKnownError;
    if (prismaError && typeof prismaError.code === 'string') {
      const mapped = this.mapPrismaError(prismaError);
      if (mapped) {
        this.respond(
          response,
          request,
          mapped.status,
          mapped.message,
          prismaError.meta,
        );
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    this.respond(
      response,
      request,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
    );
  }

  private formatTarget(target: unknown): string {
    if (Array.isArray(target)) {
      return target.join(', ');
    }
    if (typeof target === 'string') {
      return target;
    }
    return 'unique field';
  }

  private mapPrismaError(
    error: PrismaKnownError,
  ): { status: number; message: string } | null {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with the same value already exists: ${this.formatTarget(
            error.meta?.target,
          )}`,
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Constraint violation on related record',
        };
      case 'P2012':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Missing required value',
        };
      case 'P2010':
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Database value out of range',
        };
      default:
        return null;
    }
  }

  private respond(
    response: Response,
    request: Request,
    status: number,
    message: string,
    details?: unknown,
  ): void {
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url ?? '',
      requestId: (request as Request & { id?: unknown }).id ?? null,
      message,
      ...(details ? { details } : {}),
    });
  }
}
