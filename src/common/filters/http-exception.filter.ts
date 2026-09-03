import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * One JSON shape for every error the API returns, whether it's a thrown
 * `HttpException` (validation, not-found, forbidden) or something
 * unexpected — a caller should never have to branch on response shape by
 * status code.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = isHttp ? exception.getResponse() : undefined;
    const message =
      typeof response === 'object' && response !== null && 'message' in response
        ? (response as { message: string | string[] }).message
        : isHttp
          ? exception.message
          : 'Internal server error';

    if (!isHttp) {
      // Never leak an unexpected error's real message to the client — but log it in full.
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    reply.status(status).send(body);
  }
}
