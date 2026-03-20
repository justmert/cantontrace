/**
 * Global Error Handler Middleware
 *
 * Maps all errors to the ApiError response format.
 * Handles CantonError specifically to preserve error category information.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { CantonError } from '../canton/errors.js';
import type { ApiError } from '../types.js';

/**
 * Register the global error handler on the Fastify instance.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const { statusCode, body } = mapErrorToResponse(error);

    request.log.error({
      err: error,
      statusCode,
      errorCode: body.code,
    }, 'Request error');

    reply.code(statusCode).send(body);
  });

  // Handle 404s
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    } satisfies ApiError);
  });
}

function mapErrorToResponse(error: FastifyError | Error): { statusCode: number; body: ApiError } {
  // CantonError — gRPC errors from Canton participant
  if (error instanceof CantonError) {
    const grpcToHttpStatus: Record<number, number> = {
      0: 200,   // OK
      1: 499,   // CANCELLED
      2: 500,   // UNKNOWN
      3: 400,   // INVALID_ARGUMENT
      4: 504,   // DEADLINE_EXCEEDED
      5: 404,   // NOT_FOUND
      6: 409,   // ALREADY_EXISTS
      7: 403,   // PERMISSION_DENIED
      8: 429,   // RESOURCE_EXHAUSTED
      9: 400,   // FAILED_PRECONDITION
      10: 409,  // ABORTED
      11: 400,  // OUT_OF_RANGE
      12: 501,  // UNIMPLEMENTED
      13: 500,  // INTERNAL
      14: 503,  // UNAVAILABLE
      15: 500,  // DATA_LOSS
      16: 401,  // UNAUTHENTICATED
    };

    return {
      statusCode: grpcToHttpStatus[error.grpcCode] ?? 500,
      body: {
        code: error.commandError.errorCodeId,
        message: error.commandError.message,
        category: error.commandError.categoryId,
        details: {
          grpcStatusCode: error.commandError.grpcStatusCode,
          correlationId: error.commandError.correlationId,
          errorInfo: error.commandError.errorInfo,
          requestInfo: error.commandError.requestInfo,
          retryInfo: error.commandError.retryInfo,
          resourceInfo: error.commandError.resourceInfo,
        },
      },
    };
  }

  // Fastify validation errors
  if ('validation' in error && (error as FastifyError).validation) {
    return {
      statusCode: 400,
      body: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: {
          validation: (error as FastifyError).validation,
        },
      },
    };
  }

  // Fastify errors with status code
  if ('statusCode' in error) {
    const statusCode = (error as FastifyError).statusCode ?? 500;
    return {
      statusCode,
      body: {
        code: statusCode === 429 ? 'RATE_LIMITED' : `HTTP_${statusCode}`,
        message: error.message,
      },
    };
  }

  // Generic errors
  return {
    statusCode: 500,
    body: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : error.message,
    },
  };
}
